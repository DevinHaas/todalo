ALTER TABLE "saved_filters" ALTER COLUMN "definition" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "labels" ADD COLUMN "favorite" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "labels" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "saved_filters" ADD COLUMN "query" text;--> statement-breakpoint
ALTER TABLE "saved_filters" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "saved_filters" ADD COLUMN "color" text;--> statement-breakpoint
ALTER TABLE "saved_filters" ADD COLUMN "favorite" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "saved_filters" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;