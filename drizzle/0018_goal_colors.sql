ALTER TABLE "goals" ADD COLUMN "color" text DEFAULT 'blue' NOT NULL;--> statement-breakpoint
-- Existing goals: distinct palette colours per user in sidebar order (goalColors in goal-dto.ts).
UPDATE "goals" SET "color" = (ARRAY['blue','green','orange','violet','pink','teal','amber','red','indigo','slate'])[(ordered.n % 10) + 1]
FROM (SELECT "id", row_number() OVER (PARTITION BY "user_id" ORDER BY "sort_order", "created_at", "id") - 1 AS n FROM "goals") AS ordered
WHERE "goals"."id" = ordered."id";
