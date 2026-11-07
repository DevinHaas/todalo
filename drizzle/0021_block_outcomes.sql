ALTER TABLE "time_blocks" ADD COLUMN "outcome" text DEFAULT 'planned' NOT NULL;--> statement-breakpoint
ALTER TABLE "time_blocks" ADD COLUMN "reschedule_count" integer DEFAULT 0 NOT NULL;