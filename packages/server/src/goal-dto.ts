// Client-safe JSON contract and input rules for goals (zod only, no database
// imports, so the shared client may import these).
import { z } from "zod";
import type { ProjectDto } from "./project-dto";
import type { TaskDto } from "./task-dto";

export interface GoalDto { id: string; title: string; description: string | null; archived: boolean }
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
export interface GoalLinksDto { projects: { goalId: string; projectId: string }[]; tasks: { goalId: string; taskId: string }[] }
/** Ticket 03: goals suggested for a task, best first; empty once it has a goal or while Goals is hidden. */
export interface GoalSuggestionsDto { goalIds: string[] }
/** What a goal links to; also the URL segment (/goals/:id/projects/:projectId). */
export type GoalLinkKind = "projects" | "tasks";
export const goalLinkKinds: readonly GoalLinkKind[] = ["projects", "tasks"];

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
