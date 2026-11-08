CREATE TABLE "coach_draft_items" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"draft_id" text NOT NULL,
	"position" integer NOT NULL,
	"op" text NOT NULL,
	"task_id" text,
	"title" text NOT NULL,
	"start_at" timestamp NOT NULL,
	"end_at" timestamp,
	"goal_id" text,
	"reason" text NOT NULL,
	"seen_updated_at" timestamp,
	"state" text DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coach_drafts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"period" date NOT NULL,
	"summary" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coach_draft_items" ADD CONSTRAINT "coach_draft_items_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_draft_items" ADD CONSTRAINT "coach_draft_items_draft_id_coach_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."coach_drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_draft_items" ADD CONSTRAINT "coach_draft_items_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_draft_items" ADD CONSTRAINT "coach_draft_items_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_drafts" ADD CONSTRAINT "coach_drafts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coach_draft_items_draft_idx" ON "coach_draft_items" USING btree ("draft_id");--> statement-breakpoint
CREATE INDEX "coach_drafts_user_status_idx" ON "coach_drafts" USING btree ("user_id","status");