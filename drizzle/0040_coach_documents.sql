CREATE TABLE "coach_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"media_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"content" text NOT NULL,
	"text" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coach_draft_items" ADD COLUMN "parent_id" text;--> statement-breakpoint
ALTER TABLE "coach_draft_items" ADD COLUMN "parent_item_id" text;--> statement-breakpoint
ALTER TABLE "coach_draft_items" ADD COLUMN "document_id" text;--> statement-breakpoint
ALTER TABLE "coach_documents" ADD CONSTRAINT "coach_documents_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coach_documents_user_idx" ON "coach_documents" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "coach_draft_items" ADD CONSTRAINT "coach_draft_items_parent_id_tasks_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_draft_items" ADD CONSTRAINT "coach_draft_items_document_id_coach_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."coach_documents"("id") ON DELETE cascade ON UPDATE no action;