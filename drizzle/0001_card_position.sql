DROP INDEX "cards_deck_idx";--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "cards_deck_idx" ON "cards" USING btree ("deck_id","position");