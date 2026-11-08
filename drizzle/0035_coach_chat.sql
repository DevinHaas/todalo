CREATE TABLE "coach_chat_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"draft_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coach_chat_messages" ADD CONSTRAINT "coach_chat_messages_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_chat_messages" ADD CONSTRAINT "coach_chat_messages_draft_id_coach_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."coach_drafts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coach_chat_messages_user_created_idx" ON "coach_chat_messages" USING btree ("user_id","created_at");