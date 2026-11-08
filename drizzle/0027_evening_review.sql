ALTER TYPE "public"."ritual_kind" ADD VALUE 'evening_review';--> statement-breakpoint
ALTER TABLE "ritual_settings" ADD COLUMN "evening_review_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ritual_settings" ADD COLUMN "evening_review_time" text DEFAULT '20:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "ritual_settings" ADD COLUMN "evening_review_task_id" text;--> statement-breakpoint
ALTER TABLE "ritual_settings" ADD COLUMN "notify" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "ritual_settings" ADD CONSTRAINT "ritual_settings_evening_review_task_id_tasks_id_fk" FOREIGN KEY ("evening_review_task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;