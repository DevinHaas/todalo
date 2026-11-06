CREATE TABLE "goal_suggestion_dismissals" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"goal_id" text NOT NULL,
	"task_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "goal_suggestion_dismissals" ADD CONSTRAINT "goal_suggestion_dismissals_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_suggestion_dismissals" ADD CONSTRAINT "goal_suggestion_dismissals_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_suggestion_dismissals" ADD CONSTRAINT "goal_suggestion_dismissals_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "goal_suggestion_dismissals_task_goal_idx" ON "goal_suggestion_dismissals" USING btree ("task_id","goal_id");--> statement-breakpoint
CREATE INDEX "goal_suggestion_dismissals_userId_idx" ON "goal_suggestion_dismissals" USING btree ("user_id");