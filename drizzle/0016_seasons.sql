CREATE TYPE "public"."season_goal_tier" AS ENUM('primary', 'secondary');--> statement-breakpoint
CREATE TABLE "season_goals" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"season_id" text NOT NULL,
	"goal_id" text NOT NULL,
	"tier" "season_goal_tier" NOT NULL,
	"target" text NOT NULL,
	"carried_from_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"start_date" date NOT NULL,
	"length_days" integer NOT NULL,
	"ended_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "season_goals" ADD CONSTRAINT "season_goals_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_goals" ADD CONSTRAINT "season_goals_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_goals" ADD CONSTRAINT "season_goals_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_goals" ADD CONSTRAINT "season_goals_carried_from_id_season_goals_id_fk" FOREIGN KEY ("carried_from_id") REFERENCES "public"."season_goals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "season_goals_season_goal_idx" ON "season_goals" USING btree ("season_id","goal_id");--> statement-breakpoint
CREATE INDEX "season_goals_userId_idx" ON "season_goals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "seasons_userId_idx" ON "seasons" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "seasons_one_current_idx" ON "seasons" USING btree ("user_id") WHERE "seasons"."ended_at" is null;