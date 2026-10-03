CREATE TABLE "user_keyboard_preferences" (
  "user_id" text PRIMARY KEY NOT NULL,
  "preferences" jsonb NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "user_keyboard_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE CASCADE
);
