ALTER TABLE "coach_drafts" ADD COLUMN "overflow" jsonb;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "coach_share_event_titles" boolean DEFAULT false NOT NULL;