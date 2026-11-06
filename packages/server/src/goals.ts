// Server-only goal operations for /api/v1. Transports authenticate before
// supplying userId; every read and write is scoped to the owner, so a foreign
// ID behaves exactly like a missing one.
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@todalo/db";
import { goalProjects, goalTasks, goals, projects, tasks, userSettings } from "@todalo/db/schema";
import { planReorder } from "./bulk-input";
import { getTasksForUser } from "./today";
import type { CreateGoalInput, GoalLinkKind, GoalLinksDto, ReorderGoalInput, UpdateGoalInput } from "./goal-dto";

const owned = (userId: string, id: string) => and(eq(goals.id, id), eq(goals.userId, userId));
const order = [asc(goals.sortOrder), asc(goals.createdAt), asc(goals.id)] as const;

/** Active (unarchived) goals in the user's order: the sidebar. */
export async function getGoalsForUser(userId: string) {
  return db.select().from(goals).where(and(eq(goals.userId, userId), isNull(goals.archivedAt))).orderBy(...order);
}

/** Archived goals too: their page still opens. null for missing and foreign IDs. */
export async function getOwnedGoal(userId: string, id: string) {
  const [goal] = await db.select().from(goals).where(owned(userId, id)).limit(1);
  return goal ?? null;
}

/** New goals go to the end of the sidebar. */
export async function createGoal(userId: string, input: CreateGoalInput) {
  const [goal] = await db.insert(goals).values({
    userId, title: input.title, description: input.description ?? null,
    sortOrder: sql`(select coalesce(max(${goals.sortOrder}), -1) + 1 from ${goals} where ${goals.userId} = ${userId})`,
  }).returning();
  return goal!;
}

export async function updateGoal(userId: string, id: string, patch: UpdateGoalInput) {
  const { archived, ...fields } = patch;
  const [goal] = await db.update(goals)
    .set({ ...fields, ...(archived !== undefined && { archivedAt: archived ? new Date() : null }) })
    .where(owned(userId, id)).returning();
  return goal ?? null;
}

/**
 * Moves an active goal next to another and renumbers the sidebar, relative to
 * the current order (so a retry is a no-op). false when either goal is missing,
 * foreign or archived, or the goal is its own anchor.
 */
export async function reorderGoal(userId: string, id: string, move: ReorderGoalInput) {
  const current = await db.select({ id: goals.id }).from(goals).where(and(eq(goals.userId, userId), isNull(goals.archivedAt))).orderBy(...order);
  const next = planReorder(current.map(goal => goal.id), id, move.anchorId, move.position);
  if (!next) return false;
  // ponytail: one update per goal; a user has a handful of goals.
  await Promise.all(next.map((goalId, sortOrder) => db.update(goals).set({ sortOrder, updatedAt: sql`${goals.updatedAt}` }).where(owned(userId, goalId))));
  return true;
}

export async function getGoalsHidden(userId: string) {
  const [row] = await db.select({ hidden: userSettings.goalsHidden }).from(userSettings).where(eq(userSettings.userId, userId));
  return row?.hidden ?? false;
}

export async function setGoalsHidden(userId: string, hidden: boolean) {
  await db.insert(userSettings).values({ userId, goalsHidden: hidden })
    .onConflictDoUpdate({ target: userSettings.userId, set: { goalsHidden: hidden, updatedAt: new Date() } });
  return hidden;
}

/** Every link of the user (the pickers derive a task's or project's goals from it). */
export async function getGoalLinks(userId: string): Promise<GoalLinksDto> {
  const [projectLinks, taskLinks] = await Promise.all([
    db.select({ goalId: goalProjects.goalId, projectId: goalProjects.projectId }).from(goalProjects).where(eq(goalProjects.userId, userId)),
    db.select({ goalId: goalTasks.goalId, taskId: goalTasks.taskId }).from(goalTasks).where(eq(goalTasks.userId, userId)),
  ]);
  return { projects: projectLinks, tasks: taskLinks };
}

/** A goal's linked projects (by name) and linked tasks (in manual order). */
export async function getGoalWork(userId: string, goalId: string) {
  const [linkedProjects, taskLinks] = await Promise.all([
    db.select({ id: projects.id, name: projects.name, color: projects.color }).from(goalProjects)
      .innerJoin(projects, eq(projects.id, goalProjects.projectId))
      .where(and(eq(goalProjects.userId, userId), eq(goalProjects.goalId, goalId))).orderBy(projects.name),
    db.select({ taskId: goalTasks.taskId }).from(goalTasks).where(and(eq(goalTasks.userId, userId), eq(goalTasks.goalId, goalId))),
  ]);
  const linked = new Set(taskLinks.map(link => link.taskId));
  // ponytail: reads all the user's tasks to reuse the label/comment shaping; a task query by IDs if lists grow large.
  const linkedTasks = linked.size ? (await getTasksForUser(userId)).filter(task => linked.has(task.id)) : [];
  return { projects: linkedProjects, tasks: linkedTasks };
}

const ownedTarget = async (userId: string, kind: GoalLinkKind, id: string) => {
  const table = kind === "projects" ? projects : tasks;
  const [row] = await db.select({ id: table.id }).from(table).where(and(eq(table.id, id), eq(table.userId, userId))).limit(1);
  return Boolean(row);
};

/** Idempotent. false when the goal or the project/task is missing or foreign. */
export async function linkGoal(userId: string, goalId: string, kind: GoalLinkKind, targetId: string) {
  if (!await getOwnedGoal(userId, goalId) || !await ownedTarget(userId, kind, targetId)) return false;
  if (kind === "projects") await db.insert(goalProjects).values({ userId, goalId, projectId: targetId }).onConflictDoNothing();
  else await db.insert(goalTasks).values({ userId, goalId, taskId: targetId }).onConflictDoNothing();
  return true;
}

/** Deletes only the link row, never the project or task. Idempotent; false when the goal is missing or foreign. */
export async function unlinkGoal(userId: string, goalId: string, kind: GoalLinkKind, targetId: string) {
  if (!await getOwnedGoal(userId, goalId)) return false;
  if (kind === "projects") await db.delete(goalProjects).where(and(eq(goalProjects.userId, userId), eq(goalProjects.goalId, goalId), eq(goalProjects.projectId, targetId)));
  else await db.delete(goalTasks).where(and(eq(goalTasks.userId, userId), eq(goalTasks.goalId, goalId), eq(goalTasks.taskId, targetId)));
  return true;
}
