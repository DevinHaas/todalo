// Client-safe JSON contract and input rules for goals (zod only, no database
// imports, so the shared client may import these).
import { z } from "zod";
import type { ProjectDto } from "./project-dto";
import type { TaskDto } from "./task-dto";

/**
 * The fixed goal palette, in assignment order: key → a mid-tone that reads on
 * light and dark. The key is what is stored and sent; ticket 07's calendar uses it too.
 */
export const goalColors = {
  blue: "oklch(0.62 0.16 250)", green: "oklch(0.64 0.16 150)", orange: "oklch(0.7 0.16 55)", violet: "oklch(0.6 0.19 300)", pink: "oklch(0.66 0.19 350)",
  teal: "oklch(0.65 0.11 190)", amber: "oklch(0.76 0.15 85)", red: "oklch(0.62 0.2 25)", indigo: "oklch(0.55 0.17 275)", slate: "oklch(0.58 0.03 255)",
} as const;
export type GoalColor = keyof typeof goalColors;
export const goalColorKeys = Object.keys(goalColors) as GoalColor[];
/** A new goal's default: the next palette colour after the user's existing goals. */
export const nextGoalColor = (existing: number): GoalColor => goalColorKeys[existing % goalColorKeys.length]!;
/** CSS colour for a stored key; unknown keys (never written, but old clients) fall back to the first. */
export const goalColorValue = (color: string) => goalColors[color as GoalColor] ?? goalColors.blue;

export interface GoalDto { id: string; title: string; description: string | null; color: GoalColor; archived: boolean }
/** The sidebar read: active goals in the user's order, and whether Goals is hidden. */
export interface GoalsDto { goals: GoalDto[]; hidden: boolean }

/** One done criterion of a milestone (ticket 06), in the user's order. */
export interface CriterionDto { text: string; done: boolean }
/** A task's milestone: the linked goal it is a milestone for, and its done criteria. */
export interface MilestoneDto { goalId: string; criteria: CriterionDto[] }
/** A milestone on its goal's page, with criteria progress. */
export interface GoalMilestoneDto { task: TaskDto; criteria: CriterionDto[]; reached: boolean }
/** A goal's page: the goal and the work explicitly linked to it (ticket 02), milestones by due date (ticket 06). */
export interface GoalDetailDto { goal: GoalDto; projects: ProjectDto[]; tasks: TaskDto[]; milestones: GoalMilestoneDto[] }
/** Every link of the signed-in user, for the task sheet and project page pickers. */
export interface GoalLinksDto { projects: { goalId: string; projectId: string }[]; tasks: { goalId: string; taskId: string; milestone: boolean }[] }
/** Ticket 03: goals suggested for a task, best first; empty once it has a goal or while Goals is hidden. */
export interface GoalSuggestionsDto { goalIds: string[] }
/** What a goal links to; also the URL segment (/goals/:id/projects/:projectId). */
export type GoalLinkKind = "projects" | "tasks";
export const goalLinkKinds: readonly GoalLinkKind[] = ["projects", "tasks"];

export interface GoalRecord { id: string; title: string; description: string | null; color: string; archivedAt: Date | null }

/** Allow-lists fields: user IDs and ordering internals never leave the server. */
export const toGoalDto = (goal: GoalRecord): GoalDto => ({ id: goal.id, title: goal.title, description: goal.description, color: goalColorKeys.includes(goal.color as GoalColor) ? goal.color as GoalColor : "blue", archived: goal.archivedAt !== null });

const title = z.string().trim().min(1).max(200);
// An empty description clears it.
const description = z.string().max(10_000).transform(value => value.trim() || null);

const color = z.enum(goalColorKeys as [GoalColor, ...GoalColor[]]);

export const createGoalInput = z.object({ title, description: description.optional(), color: color.optional() }).strict();
/** Only the supplied fields change; `archived: true` archives (soft), false restores. */
export const updateGoalInput = z.object({ title: title.optional(), description: description.optional(), color: color.optional(), archived: z.boolean().optional() }).strict()
  .refine(patch => Object.keys(patch).length > 0, { message: "Nothing to change" });
export const reorderGoalInput = z.object({ anchorId: z.string().min(1).max(200), position: z.enum(["before", "after"]) }).strict();
export const goalsVisibilityInput = z.object({ hidden: z.boolean() }).strict();

/**
 * Reached only once every criterion is ticked. Without criteria there is
 * nothing to tick, so completing the task reaches it.
 */
export const milestoneReached = (criteria: readonly CriterionDto[], taskDone: boolean) => criteria.length ? criteria.every(item => item.done) : taskDone;

/** Marks (or keeps) the task a milestone for one linked goal and replaces its criteria, in order. */
export const milestoneInput = z.object({
  goalId: z.string().min(1).max(200),
  criteria: z.array(z.object({ text: z.string().trim().min(1).max(500), done: z.boolean() }).strict()).max(50),
}).strict();

export type MilestoneInput = z.infer<typeof milestoneInput>;
export type CreateGoalInput = z.infer<typeof createGoalInput>;
export type UpdateGoalInput = z.infer<typeof updateGoalInput>;
export type ReorderGoalInput = z.infer<typeof reorderGoalInput>;
