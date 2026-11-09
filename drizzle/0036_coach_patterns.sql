CREATE TABLE "coach_patterns" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"statement" text NOT NULL,
	"evidence" text NOT NULL,
	"source" text NOT NULL,
	"learned_at" timestamp DEFAULT now() NOT NULL,
	"edited_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "coach_patterns" ADD CONSTRAINT "coach_patterns_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coach_patterns_user_idx" ON "coach_patterns" USING btree ("user_id");