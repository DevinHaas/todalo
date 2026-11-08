CREATE TABLE "coach_chatgpt_clients" (
	"user_id" text NOT NULL,
	"redirect_key" text NOT NULL,
	"client_id" text NOT NULL,
	"email" text,
	"sharing" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "coach_chatgpt_clients_user_id_redirect_key_pk" PRIMARY KEY("user_id","redirect_key")
);
--> statement-breakpoint
ALTER TABLE "coach_chatgpt_clients" ADD CONSTRAINT "coach_chatgpt_clients_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;