/**
 * Drizzle schema. Two groups of tables:
 *
 *   Better Auth owns user, session, account, verification and rateLimit. Their
 *   shape comes from its CLI (`npx @better-auth/cli generate`) plus the
 *   username and anonymous plugin columns.
 *
 *   Halflife owns the rest: settings, recovery codes, decks, cards, the
 *   per-user card state, the append-only review log, and model versions.
 */

import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------- Better Auth

export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    // Better Auth requires an email column. Halflife never asks for one: the
    // value is a placeholder on the reserved .invalid domain, derived from the
    // username, and nothing is ever sent to it.
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    image: text("image"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    username: text("username").unique(),
    displayUsername: text("display_username"),
    isAnonymous: boolean("is_anonymous").default(false),
  },
  (t) => [index("user_created_idx").on(t.createdAt)],
);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

// Better Auth's rate limiter, stored in the database so it holds across
// serverless invocations.
export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

// ---------------------------------------------------------------- Halflife

export const SCHEDULERS = ["classic", "halflife"] as const;
export type Scheduler = (typeof SCHEDULERS)[number];

export const settings = pgTable("settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  targetRetention: doublePrecision("target_retention").default(0.9).notNull(),
  newPerDay: integer("new_per_day").default(10).notNull(),
  scheduler: text("scheduler", { enum: SCHEDULERS }).default("classic").notNull(),
  shareLogs: boolean("share_logs").default(false).notNull(),
});

export const recoveryCode = pgTable("recovery_code", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  codeHash: text("code_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});

export const decks = pgTable(
  "decks",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("decks_user_idx").on(t.userId)],
);

export const cards = pgTable(
  "cards",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    deckId: text("deck_id")
      .notNull()
      .references(() => decks.id, { onDelete: "cascade" }),
    front: text("front").notNull(),
    back: text("back").notNull(),
    example: text("example"),
    note: text("note"),
    // Cards copied from a starter deck share a key across users, so the
    // per-card model term can learn from everyone's reviews of that card.
    sourceKey: text("source_key"),
    // Order within the deck. Batch inserts share a timestamp, so time alone is not enough.
    position: integer("position").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("cards_deck_idx").on(t.deckId, t.position), index("cards_source_idx").on(t.sourceKey)],
);

export const cardState = pgTable(
  "card_state",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    cardId: text("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    seen: integer("seen").default(0).notNull(),
    correct: integer("correct").default(0).notNull(),
    wrong: integer("wrong").default(0).notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }),
    lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
    lastResponseMs: integer("last_response_ms"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    halfLifeDays: doublePrecision("half_life_days"),
    scheduler: text("scheduler", { enum: SCHEDULERS }),
    modelVersion: integer("model_version"),
    // Classic (SM-2) state, kept alongside so switching schedulers loses nothing.
    sm2Reps: integer("sm2_reps").default(0).notNull(),
    sm2Ease: doublePrecision("sm2_ease").default(2.5).notNull(),
    sm2IntervalDays: doublePrecision("sm2_interval_days").default(0).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.cardId] }),
    index("card_state_due_idx").on(t.userId, t.dueAt),
  ],
);

export const reviews = pgTable(
  "reviews",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    cardId: text("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull(),
    deltaSeconds: integer("delta_seconds"),
    remembered: boolean("remembered").notNull(),
    responseMs: integer("response_ms"),
    // Which scheduler set the due date this review answered.
    scheduler: text("scheduler", { enum: SCHEDULERS }),
    // The model's opinion at review time, recorded whichever scheduler was active.
    pPredicted: doublePrecision("p_predicted"),
    hPredicted: doublePrecision("h_predicted"),
    modelVersion: integer("model_version"),
    seenBefore: integer("seen_before").notNull(),
    correctBefore: integer("correct_before").notNull(),
  },
  (t) => [
    uniqueIndex("reviews_user_card_time_idx").on(t.userId, t.cardId, t.reviewedAt),
    index("reviews_user_time_idx").on(t.userId, t.reviewedAt),
  ],
);

export const modelVersions = pgTable("model_versions", {
  version: integer("version").primaryKey(),
  trainedAt: timestamp("trained_at", { withTimezone: true }).notNull(),
  dataRows: integer("data_rows"),
  metrics: jsonb("metrics"),
  weightsSha: text("weights_sha").notNull(),
});

// ---------------------------------------------------------------- relations

export const decksRelations = relations(decks, ({ many }) => ({ cards: many(cards) }));
export const cardsRelations = relations(cards, ({ one, many }) => ({
  deck: one(decks, { fields: [cards.deckId], references: [decks.id] }),
  states: many(cardState),
}));
export const cardStateRelations = relations(cardState, ({ one }) => ({
  card: one(cards, { fields: [cardState.cardId], references: [cards.id] }),
}));
