CREATE TABLE "labels" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_filters" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"definition" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_labels" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"task_id" text NOT NULL,
	"label_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "priority" integer DEFAULT 4 NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "deadline" timestamp;--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_filters" ADD CONSTRAINT "saved_filters_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_labels" ADD CONSTRAINT "task_labels_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_labels" ADD CONSTRAINT "task_labels_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_labels" ADD CONSTRAINT "task_labels_label_id_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."labels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "labels_userId_idx" ON "labels" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "saved_filters_userId_idx" ON "saved_filters" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_labels_task_label_idx" ON "task_labels" USING btree ("task_id","label_id");--> statement-breakpoint
CREATE INDEX "task_labels_userId_idx" ON "task_labels" USING btree ("user_id");