import { db } from "@todalo/db";
import { labels, projects, taskLabels, tasks } from "@todalo/db/schema";
import type { RambleTodo } from "@todalo/ramble";
import { and, eq, inArray } from "drizzle-orm";
import { zonedTaskDate } from "./dates";

export function prepareTaskRows(todos: RambleTodo[], userId: string, timeZone: string) {
  if (todos.length > 500) throw new Error("Too many tasks");
  const byId = new Map(todos.map((todo) => [todo.id, todo]));
  if (byId.size !== todos.length) throw new Error("Duplicate staged ID");
  const ids = new Map(todos.map((todo) => [todo.id, crypto.randomUUID()]));
  return todos.map((todo, sortOrder) => {
    if (!todo.title.trim() || todo.title.length > 4000) throw new Error("Invalid title");
    if ((todo.description?.length ?? 0) > 4000 || ![1, 2, 3, 4].includes(todo.priority)) throw new Error("Invalid task details");
    const parent = todo.parentId ? byId.get(todo.parentId) : null;
    if (todo.parentId && (!parent || parent.parentId || parent.id === todo.id)) throw new Error("Invalid sub-task parent");
    const dueDate = zonedTaskDate(todo.dueDate, todo.startTime, timeZone);
    let dueDateEnd = todo.endTime ? zonedTaskDate(todo.dueDate, todo.endTime, timeZone) : null;
    if (dueDate && dueDateEnd && dueDateEnd <= dueDate) {
      const nextDay = new Date(`${todo.dueDate}T12:00:00Z`);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      dueDateEnd = zonedTaskDate(nextDay.toISOString().slice(0, 10), todo.endTime, timeZone);
    }
    return {
      id: ids.get(todo.id)!, userId, title: todo.title.trim(),
      parentId: todo.parentId ? ids.get(todo.parentId)! : null,
      projectId: todo.projectId, dueDate, dueDateEnd,
      description: todo.description?.trim() || null, priority: todo.priority,
      // Matches the task editor, which stores a deadline as local midnight.
      deadline: zonedTaskDate(todo.deadline, null, timeZone),
      recurrence: todo.recurrence ? { ...todo.recurrence, until: todo.recurrence.until ? new Date(todo.recurrence.until) : null } : null, sortOrder,
    };
  });
}

export async function commitRambleTodos(userId: string, todos: RambleTodo[], timeZone: string) {
  const rows = prepareTaskRows(todos, userId, timeZone);
  if (!rows.length) return 0;
  const projectIds = [...new Set(rows.flatMap((row) => row.projectId ? [row.projectId] : []))];
  if (projectIds.length) {
    const owned = await db.select({ id: projects.id }).from(projects)
      .where(and(eq(projects.userId, userId), inArray(projects.id, projectIds)));
    if (owned.length !== projectIds.length) throw new Error("Project unavailable");
  }
  const labelRows = todos.flatMap((todo, index) => [...new Set(todo.labelIds)].map((labelId) => ({ userId, taskId: rows[index].id, labelId })));
  const labelIds = [...new Set(labelRows.map((row) => row.labelId))];
  if (labelIds.length) {
    const owned = await db.select({ id: labels.id }).from(labels)
      .where(and(eq(labels.userId, userId), inArray(labels.id, labelIds)));
    if (owned.length !== labelIds.length) throw new Error("Label unavailable");
  }
  // Neon's HTTP driver has no interactive transactions; a batch runs as one
  // non-interactive transaction. Parent IDs are allocated beforehand.
  const insertTasks = db.insert(tasks).values(rows);
  if (labelRows.length) await db.batch([insertTasks, db.insert(taskLabels).values(labelRows)]);
  else await insertTasks;
  return rows.length;
}
