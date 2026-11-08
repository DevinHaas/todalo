CREATE TABLE "coach_recommendations" (
	"user_id" text NOT NULL,
	"goal_id" text NOT NULL,
	"inputs_hash" text NOT NULL,
	"text" text NOT NULL,
	"dismissed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "coach_recommendations_user_id_goal_id_pk" PRIMARY KEY("user_id","goal_id")
);
--> statement-breakpoint
CREATE TABLE "task_moves" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"task_id" text NOT NULL,
	"from_date" timestamp NOT NULL,
	"to_date" timestamp,
	"moved_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coach_recommendations" ADD CONSTRAINT "coach_recommendations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_recommendations" ADD CONSTRAINT "coach_recommendations_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_moves" ADD CONSTRAINT "task_moves_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_moves" ADD CONSTRAINT "task_moves_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_moves_user_moved_idx" ON "task_moves" USING btree ("user_id","moved_at");--> statement-breakpoint
-- Ticket 21: log every change of an open task's date or time, whichever path
-- wrote it (API, drafts, Google sync). A recurring task's completion advances
-- its date with a new last_completion_id: that is not a move.
CREATE OR REPLACE FUNCTION task_moves_log() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO task_moves (id, user_id, task_id, from_date, to_date)
  VALUES (gen_random_uuid()::text, NEW.user_id, NEW.id, OLD.due_date, NEW.due_date);
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER task_moves_log AFTER UPDATE OF due_date ON tasks FOR EACH ROW
  WHEN (OLD.due_date IS NOT NULL AND NEW.due_date IS DISTINCT FROM OLD.due_date AND OLD.status <> 'done' AND NEW.status <> 'done'
    AND NEW.last_completion_id IS NOT DISTINCT FROM OLD.last_completion_id)
  EXECUTE FUNCTION task_moves_log();
