import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { anonymous, username } from "better-auth/plugins";
import { createAuthMiddleware } from "better-auth/api";
import { eq } from "drizzle-orm";

import { db, schema } from "@/lib/db";

import { recoveryCode } from "./recovery";

export const USERNAME_RULE = /^[a-z0-9_]{3,24}$/i;

// Better Auth needs an email per user. Nobody types one: the address is
// derived from the username on a reserved domain that cannot receive mail.
export const placeholderEmail = (usernameValue: string) =>
  `${usernameValue.toLowerCase()}@users.halflife.invalid`;

function baseURL(): string {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL;
  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/** Move everything the anonymous user made to the account that replaces it, in one transaction. */
async function moveUserData(fromUserId: string, toUserId: string): Promise<void> {
  await db.transaction(async (tx) => {
    for (const table of [schema.decks, schema.cardState, schema.reviews]) {
      await tx.update(table).set({ userId: toUserId }).where(eq(table.userId, fromUserId));
    }
    // Settings: keep the anonymous user's choices if the new account has none yet.
    const [existing] = await tx
      .select({ userId: schema.settings.userId })
      .from(schema.settings)
      .where(eq(schema.settings.userId, toUserId));
    if (existing) {
      await tx.delete(schema.settings).where(eq(schema.settings.userId, fromUserId));
    } else {
      await tx
        .update(schema.settings)
        .set({ userId: toUserId })
        .where(eq(schema.settings.userId, fromUserId));
    }
  });
}

export const auth = betterAuth({
  appName: "Halflife",
  baseURL: baseURL(),
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
      rateLimit: schema.rateLimit,
    },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    requireEmailVerification: false,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    // No cookie cache: every request checks the session row, so deleting the
    // rows really does sign out everywhere, at once.
    cookieCache: { enabled: false },
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    modelName: "rateLimit",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/username": { window: 60, max: 10 },
      "/sign-up/email": { window: 60, max: 10 },
      "/sign-in/anonymous": { window: 60, max: 10 },
    },
  },
  user: { deleteUser: { enabled: true } },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      // Sign-up carries a username; the email is always the placeholder, never client input.
      if (ctx.path === "/sign-up/email") {
        const body = ctx.body as { username?: string; email?: string; name?: string };
        const u = body.username?.trim() ?? "";
        if (!USERNAME_RULE.test(u)) return;
        return {
          context: {
            ...ctx,
            body: { ...body, username: u.toLowerCase(), email: placeholderEmail(u), name: u },
          },
        };
      }
    }),
  },
  plugins: [
    username({
      minUsernameLength: 3,
      maxUsernameLength: 24,
      usernameValidator: (u) => USERNAME_RULE.test(u),
    }),
    anonymous({
      emailDomainName: "anon.halflife.invalid",
      generateName: () => "Guest",
      onLinkAccount: async ({ anonymousUser, newUser }) => {
        await moveUserData(anonymousUser.user.id, newUser.user.id);
      },
    }),
    recoveryCode(),
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
