CREATE TABLE "coach_chatgpt" (
	"user_id" text PRIMARY KEY NOT NULL,
	"model" text NOT NULL,
	"encrypted_tokens" text,
	"account_id" text,
	"email" text,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coach_chatgpt" ADD CONSTRAINT "coach_chatgpt_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;