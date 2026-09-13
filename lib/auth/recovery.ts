/**
 * Recovery codes: the only way back into an account, since there is no email.
 *
 * A code is 25 characters (125 bits) shown once at sign-up. The database
 * stores its SHA-256. Resetting with the code sets a new password,
 * signs the user in on this device, signs out every other device, and hands
 * back a fresh code, so a code is never reused.
 */

import { APIError, createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import type { BetterAuthPlugin } from "better-auth/types";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/lib/db";

import { codesMatch, generateCode, hashCode } from "./recovery-code";

async function issueCode(userId: string): Promise<string> {
  const code = generateCode();
  await db
    .insert(schema.recoveryCode)
    .values({ userId, codeHash: hashCode(code) })
    .onConflictDoUpdate({
      target: schema.recoveryCode.userId,
      set: { codeHash: hashCode(code), createdAt: new Date(), usedAt: null },
    });
  return code;
}

export const recoveryCode = () =>
  ({
    id: "recovery-code",
    endpoints: {
      generateRecoveryCode: createAuthEndpoint(
        "/recovery/generate",
        { method: "POST", use: [sessionMiddleware] },
        async (ctx) => {
          const { user } = ctx.context.session;
          if ((user as { isAnonymous?: boolean }).isAnonymous) {
            throw new APIError("BAD_REQUEST", { message: "Anonymous accounts have no recovery code" });
          }
          return ctx.json({ code: await issueCode(user.id) });
        },
      ),
      resetWithRecoveryCode: createAuthEndpoint(
        "/recovery/reset",
        {
          method: "POST",
          body: z.object({
            username: z.string().min(1),
            code: z.string().min(1),
            newPassword: z.string().min(8).max(128),
          }),
        },
        async (ctx) => {
          const invalid = () =>
            new APIError("UNAUTHORIZED", { message: "That username and recovery code do not match" });
          const username = ctx.body.username.trim().toLowerCase();
          const row = await db
            .select({ userId: schema.recoveryCode.userId, codeHash: schema.recoveryCode.codeHash })
            .from(schema.recoveryCode)
            .innerJoin(schema.user, eq(schema.user.id, schema.recoveryCode.userId))
            .where(eq(schema.user.username, username))
            .limit(1);
          const match = row[0];
          if (!match || !codesMatch(match.codeHash, ctx.body.code)) throw invalid();

          const hashed = await ctx.context.password.hash(ctx.body.newPassword);
          await ctx.context.internalAdapter.updatePassword(match.userId, hashed);
          await ctx.context.internalAdapter.deleteUserSessions(match.userId);
          const user = await ctx.context.internalAdapter.findUserById(match.userId);
          if (!user) throw invalid();
          const session = await ctx.context.internalAdapter.createSession(match.userId);
          await setSessionCookie(ctx, { session, user });
          return ctx.json({ user: { id: user.id, username }, code: await issueCode(match.userId) });
        },
      ),
    },
    rateLimit: [
      { pathMatcher: (path) => path === "/recovery/reset", window: 60, max: 5 },
      { pathMatcher: (path) => path === "/recovery/generate", window: 60, max: 5 },
    ],
  }) satisfies BetterAuthPlugin;
