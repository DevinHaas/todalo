// Server-only milestone operations (goals ticket 06). A milestone is a goal↔task
// link whose milestoneCriteria is non-null, so unlinking the goal (or deleting
// the task or goal) drops the milestone with it. A task is a milestone for at
// most one goal. Every read and write is scoped to the owner.
import { and, eq, inArray, isNotNull, ne, type SQL } from "drizzle-orm";
import { db } from "@todalo/db";
import { goalTasks, tasks } from "@todalo/db/schema";
import type { CriterionDto, MilestoneDto, MilestoneInput } from "./goal-dto";

const ownedTask = async (userId: string, taskId: string) =>
  (await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.userId, userId))).limit(1)).length > 0;

const milestoneRows = (userId: string, where: SQL) =>
  db.select({ goalId: goalTasks.goalId, taskId: goalTasks.taskId, criteria: goalTasks.milestoneCriteria }).from(goalTasks)
    .where(and(eq(goalTasks.userId, userId), where, isNotNull(goalTasks.milestoneCriteria)));
const ofTask = (userId: string, taskId: string) => and(eq(goalTasks.userId, userId), eq(goalTasks.taskId, taskId));

/** false: the task is missing or another user's; null: it is not a milestone. */
export async function getMilestone(userId: string, taskId: string): Promise<MilestoneDto | null | false> {
  if (!await ownedTask(userId, taskId)) return false;
  const [row] = await milestoneRows(userId, eq(goalTasks.taskId, taskId));
  return row ? { goalId: row.goalId, criteria: row.criteria ?? [] } : null;
}

/**
 * Marks the task a milestone for one of its linked goals and replaces its
 * criteria (add, edit, reorder and tick are all this write). Marking it for
 * another goal moves the mark. "unlinked": the goal is not linked to the task
 * (or is another user's).
 */
export async function setMilestone(userId: string, taskId: string, input: MilestoneInput): Promise<MilestoneDto | "missing" | "unlinked"> {
  if (!await ownedTask(userId, taskId)) return "missing";
  // ponytail: whole-list replace, last write wins; a per-criterion API if two devices edit one list at once.
  const [row] = await db.update(goalTasks).set({ milestoneCriteria: input.criteria })
    .where(and(ofTask(userId, taskId), eq(goalTasks.goalId, input.goalId))).returning({ goalId: goalTasks.goalId });
  if (!row) return "unlinked";
  await db.update(goalTasks).set({ milestoneCriteria: null }).where(and(ofTask(userId, taskId), ne(goalTasks.goalId, input.goalId)));
  return { goalId: input.goalId, criteria: input.criteria };
}

/** Unmarks (criteria go with it); the goal link stays. false when the task is missing or foreign. */
export async function clearMilestone(userId: string, taskId: string) {
  if (!await ownedTask(userId, taskId)) return false;
  await db.update(goalTasks).set({ milestoneCriteria: null }).where(ofTask(userId, taskId));
  return true;
}

/** The tasks among `taskIds` that are milestones with an unticked criterion. */
export async function tasksWithOpenCriteria(userId: string, taskIds: string[]) {
  if (!taskIds.length) return [];
  const rows = await milestoneRows(userId, inArray(goalTasks.taskId, taskIds));
  return rows.filter(row => row.criteria?.some(item => !item.done)).map(row => row.taskId);
}

/**
 * The one rule for every path that marks a task done (complete, status edit,
 * board move): false when it is a milestone with open criteria and the user
 * did not confirm; a confirmed one has them all ticked first.
 */
export async function criteriaAllowDone(userId: string, taskId: string, confirmCriteria = false) {
  if (!(await tasksWithOpenCriteria(userId, [taskId])).length) return true;
  if (!confirmCriteria) return false;
  await tickAllCriteria(userId, taskId);
  return true;
}

/** A confirmed completion ticks every criterion. */
export async function tickAllCriteria(userId: string, taskId: string) {
  for (const row of await milestoneRows(userId, eq(goalTasks.taskId, taskId))) {
    await db.update(goalTasks).set({ milestoneCriteria: (row.criteria ?? []).map(item => ({ ...item, done: true })) })
      .where(and(ofTask(userId, taskId), eq(goalTasks.goalId, row.goalId)));
  }
}

/** A goal's milestones (task IDs with their criteria); the goal page adds the tasks. */
export async function getGoalMilestones(userId: string, goalId: string): Promise<{ taskId: string; criteria: CriterionDto[] }[]> {
  const rows = await milestoneRows(userId, eq(goalTasks.goalId, goalId));
  return rows.map(row => ({ taskId: row.taskId, criteria: row.criteria ?? [] }));
}
