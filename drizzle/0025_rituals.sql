CREATE TYPE "public"."progress_rating" AS ENUM('massive', 'solid', 'mixed', 'little', 'not_relevant');--> statement-breakpoint
CREATE TYPE "public"."ritual_kind" AS ENUM('check_in', 'weekly_review', 'season_review');--> statement-breakpoint
CREATE TYPE "public"."ritual_run_status" AS ENUM('completed', 'skipped');--> statement-breakpoint
CREATE TABLE "progress_ratings" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"run_id" text NOT NULL,
	"goal_id" text NOT NULL,
	"rating" "progress_rating" NOT NULL,
	"context" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ritual_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" "ritual_kind" NOT NULL,
	"period" date NOT NULL,
	"status" "ritual_run_status" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ritual_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"check_in_enabled" boolean DEFAULT false NOT NULL,
	"check_in_time" text DEFAULT '09:00' NOT NULL,
	"check_in_task_id" text,
	"weekly_review_enabled" boolean DEFAULT false NOT NULL,
	"weekly_review_day" integer DEFAULT 0 NOT NULL,
	"weekly_review_time" text DEFAULT '17:00' NOT NULL,
	"season_review_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "progress_ratings" ADD CONSTRAINT "progress_ratings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_ratings" ADD CONSTRAINT "progress_ratings_run_id_ritual_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ritual_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_ratings" ADD CONSTRAINT "progress_ratings_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ritual_runs" ADD CONSTRAINT "ritual_runs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ritual_settings" ADD CONSTRAINT "ritual_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ritual_settings" ADD CONSTRAINT "ritual_settings_check_in_task_id_tasks_id_fk" FOREIGN KEY ("check_in_task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "progress_ratings_run_goal_idx" ON "progress_ratings" USING btree ("run_id","goal_id");--> statement-breakpoint
CREATE INDEX "progress_ratings_user_goal_idx" ON "progress_ratings" USING btree ("user_id","goal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ritual_runs_user_kind_period_idx" ON "ritual_runs" USING btree ("user_id","kind","period");--> statement-breakpoint
-- Live sync (0024): ritual settings, runs and ratings mark the user's "ritual" read.
CREATE TRIGGER sync_ritual_settings AFTER INSERT OR UPDATE OR DELETE ON ritual_settings FOR EACH ROW EXECUTE FUNCTION sync_touch('ritual', 'user_id');
--> statement-breakpoint
CREATE TRIGGER sync_ritual_runs AFTER INSERT OR UPDATE OR DELETE ON ritual_runs FOR EACH ROW EXECUTE FUNCTION sync_touch('ritual', 'id');
--> statement-breakpoint
CREATE TRIGGER sync_progress_ratings AFTER INSERT OR UPDATE OR DELETE ON progress_ratings FOR EACH ROW EXECUTE FUNCTION sync_touch('ritual', 'run_id');
