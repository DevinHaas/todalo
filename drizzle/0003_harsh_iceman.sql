CREATE TABLE "calendar_account_settings" (
	"account_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"show_events" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_events" (
	"id" text PRIMARY KEY NOT NULL,
	"calendar_id" text NOT NULL,
	"user_id" text NOT NULL,
	"google_event_id" text NOT NULL,
	"title" text NOT NULL,
	"start" timestamp NOT NULL,
	"end" timestamp NOT NULL,
	"all_day" boolean DEFAULT false NOT NULL,
	"event_type" text,
	"html_link" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "synced_calendars" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"google_calendar_id" text NOT NULL,
	"summary" text NOT NULL,
	"color" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"sync_token" text,
	"synced_at" timestamp,
	"channel_id" text,
	"resource_id" text,
	"channel_expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendar_account_settings" ADD CONSTRAINT "calendar_account_settings_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_account_settings" ADD CONSTRAINT "calendar_account_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_calendar_id_synced_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."synced_calendars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "synced_calendars" ADD CONSTRAINT "synced_calendars_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "synced_calendars" ADD CONSTRAINT "synced_calendars_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_events_calendar_google_idx" ON "calendar_events" USING btree ("calendar_id","google_event_id");--> statement-breakpoint
CREATE INDEX "calendar_events_userId_start_idx" ON "calendar_events" USING btree ("user_id","start");--> statement-breakpoint
CREATE INDEX "synced_calendars_userId_idx" ON "synced_calendars" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "synced_calendars_account_calendar_idx" ON "synced_calendars" USING btree ("account_id","google_calendar_id");