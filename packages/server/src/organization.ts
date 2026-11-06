// Server-only sections, destinations and task hierarchy operations (moved from
// the legacy organization Server Actions, which now only add revalidatePath).
// Callers authenticate first and pass the session's userId; every query is
// owner-scoped, so a foreign ID behaves exactly like a missing one.
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@todalo/db";
import { sections, tasks } from "@todalo/db/schema";
import { assertTaskOrganization } from "@todalo/db/task-organization";
import { ownedTaskTree } from "@todalo/db/task-parent";
import { subtreeIds, taskTree } from "@todalo/db/task-parent-validation";
import { TaskOrganizationError } from "@todalo/db/task-organization-validation";
import { getProjectsForUser } from "./projects";
import { updateTask } from "./tasks";
import { atomically, inCollection } from "./bulk";
import { manualOrder } from "./today";
import { sectionInput, taskDestination, type TaskDestination } from "./organization-input";

export async function getSectionsForUser(userId: string, projectId?: string) {
  return db.select().from(sections).where(projectId ? and(eq(sections.userId, userId), eq(sections.projectId, projectId)) : eq(sections.userId, userId)).orderBy(sections.sortOrder, sections.name);
}

/** Every place a task can be moved to (Inbox is `projectId: null`). */
export async function getOrganizationDestinations(userId: string) {
  const [projects, owned] = await Promise.all([getProjectsForUser(userId), getSectionsForUser(userId)]);
  return { projects: projects.map(({ id, name }) => ({ id, name })), sections: owned.map(({ id, projectId, name }) => ({ id, projectId, name })) };
}

/** Throws TaskOrganizationError("missing") for another user's or a missing project. */
export async function createSection(userId: string, projectId: string, name: string) {
  const parsed = sectionInput.parse({ projectId, name });
  await assertTaskOrganization({ userId, projectId: parsed.projectId, sectionId: null });
  const [section] = await db.insert(sections).values({ userId, ...parsed }).returning();
  return { id: section.id, projectId: section.projectId, name: section.name };
}

/** Member tasks stay in the project without a section (schema SET NULL). */
export async function deleteSection(userId: string, id: string) {
  const deleted = await db.delete(sections).where(and(eq(sections.id, id), eq(sections.userId, userId))).returning({ id: sections.id });
  return deleted.length > 0;
}

/**
 * Moves several tasks at once (legacy keyboard multi-select; ticket 15 bulk).
 * Moving a parent carries its children; moving a child alone makes it a root.
 * A single task is moved through updateTask (same rules plus the stale check).
 * Every selected task must be the user's ("Task not found", reason "missing")
 * before anything is written; the move, the detach and the new order (the
 * selection appended to the destination in its current order) commit as one
 * batch, so a retry re-applies the same values.
 */
export async function moveTasks(userId: string, ids: string[], input: TaskDestination) {
  const targets = taskDestination.shape.ids.parse([...new Set(ids)]);
  const data = taskDestination.omit({ ids: true }).parse(input);
  await assertTaskOrganization({ userId, ...data });
  const owned = await db.select().from(tasks).where(and(eq(tasks.userId, userId), inArray(tasks.id, targets))).orderBy(...manualOrder);
  if (owned.length !== targets.length) throw new TaskOrganizationError("Task not found", "missing");
  const destination = await db.select({ id: tasks.id, sortOrder: tasks.sortOrder }).from(tasks).where(and(eq(tasks.userId, userId), inCollection(data.projectId)));
  const start = Math.max(-1, ...destination.filter(task => !targets.includes(task.id)).map(task => task.sortOrder)) + 1;
  const detached = owned.filter(task => task.parentId && !targets.includes(task.parentId)).map(task => task.id);
  // Every descendant of a moved task goes with it (sub-tasks nest up to MAX_SUBTASK_DEPTH).
  const tree = taskTree(await ownedTaskTree(userId));
  const carried = [...new Set(targets.flatMap(id => subtreeIds(id, tree)))];
  await atomically([
    db.update(tasks).set({ ...data, updatedAt: new Date() }).where(and(eq(tasks.userId, userId), inArray(tasks.id, carried))),
    ...(detached.length ? [db.update(tasks).set({ parentId: null }).where(and(eq(tasks.userId, userId), inArray(tasks.id, detached)))] : []),
    ...owned.map((task, index) => db.update(tasks).set({ sortOrder: start + index }).where(and(eq(tasks.id, task.id), eq(tasks.userId, userId)))),
  ]);
}

/** Nesting joins the parent's project and section (updateTask enforces the rules). */
export async function setTaskParent(userId: string, taskId: string, parentId: string | null) {
  if (await updateTask(userId, { id: taskId, parentId }) === "missing") throw new Error("Task not found");
}
