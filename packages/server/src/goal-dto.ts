// Client-safe JSON contract and input rules for goals (zod only, no database
// imports, so the shared client may import these).
import { z } from "zod";

export interface GoalDto { id: string; title: string; description: string | null; archived: boolean }
/** The sidebar read: active goals in the user's order, and whether Goals is hidden. */
export interface GoalsDto { goals: GoalDto[]; hidden: boolean }

export interface GoalRecord { id: string; title: string; description: string | null; archivedAt: Date | null }

/** Allow-lists fields: user IDs and ordering internals never leave the server. */
export const toGoalDto = (goal: GoalRecord): GoalDto => ({ id: goal.id, title: goal.title, description: goal.description, archived: goal.archivedAt !== null });

const title = z.string().trim().min(1).max(200);
// An empty description clears it.
const description = z.string().max(10_000).transform(value => value.trim() || null);

export const createGoalInput = z.object({ title, description: description.optional() }).strict();
/** Only the supplied fields change; `archived: true` archives (soft), false restores. */
export const updateGoalInput = z.object({ title: title.optional(), description: description.optional(), archived: z.boolean().optional() }).strict()
  .refine(patch => Object.keys(patch).length > 0, { message: "Nothing to change" });
export const reorderGoalInput = z.object({ anchorId: z.string().min(1).max(200), position: z.enum(["before", "after"]) }).strict();
export const goalsVisibilityInput = z.object({ hidden: z.boolean() }).strict();

export type CreateGoalInput = z.infer<typeof createGoalInput>;
export type UpdateGoalInput = z.infer<typeof updateGoalInput>;
export type ReorderGoalInput = z.infer<typeof reorderGoalInput>;
