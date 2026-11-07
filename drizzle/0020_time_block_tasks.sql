CREATE TABLE "time_block_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"block_id" text NOT NULL,
	"task_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "time_block_tasks" ADD CONSTRAINT "time_block_tasks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_block_tasks" ADD CONSTRAINT "time_block_tasks_block_id_time_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."time_blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_block_tasks" ADD CONSTRAINT "time_block_tasks_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "time_block_tasks_block_task_idx" ON "time_block_tasks" USING btree ("block_id","task_id");--> statement-breakpoint
CREATE INDEX "time_block_tasks_user_idx" ON "time_block_tasks" USING btree ("user_id");