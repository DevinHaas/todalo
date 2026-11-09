CREATE TABLE "coach_capacity" (
	"user_id" text PRIMARY KEY NOT NULL,
	"available_minutes" integer,
	"inputs_hash" text,
	"estimate" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coach_goal_suggestions" (
	"user_id" text NOT NULL,
	"task_id" text NOT NULL,
	"inputs_hash" text NOT NULL,
	"goal_ids" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "coach_goal_suggestions_user_id_task_id_pk" PRIMARY KEY("user_id","task_id")
);
--> statement-breakpoint
ALTER TABLE "coach_capacity" ADD CONSTRAINT "coach_capacity_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_goal_suggestions" ADD CONSTRAINT "coach_goal_suggestions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_goal_suggestions" ADD CONSTRAINT "coach_goal_suggestions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;