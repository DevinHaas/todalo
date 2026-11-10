ALTER TABLE "season_goals" ADD COLUMN IF NOT EXISTS "baseline" text;--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN IF NOT EXISTS "intention" text;