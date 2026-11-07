// Server-only task comments. Callers authenticate first and pass the session's
// userId; a foreign task or comment behaves exactly like a missing one.
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@todalo/db";
import { taskComments, tasks, user } from "@todalo/db/schema";
import { commentInput, type CommentDto, type CommentInput } from "./comment-dto";

export type { CommentDto };

const ownsTask = async (userId: string, taskId: string) =>
  (await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.userId, userId))).limit(1)).length > 0;

const columns = { id: taskComments.id, taskId: taskComments.taskId, body: taskComments.body, createdAt: taskComments.createdAt };
// ponytail: tasks are single-user, so every comment's author is the owner (one lookup, no join).
const authorOf = async (userId: string) => {
  const [row] = await db.select({ name: user.name, image: user.image }).from(user).where(eq(user.id, userId)).limit(1);
  return { name: row?.name ?? "", image: row?.image ?? null };
};
const toDto = (row: { id: string; taskId: string; body: string; createdAt: Date }, author: CommentDto["author"]): CommentDto =>
  ({ id: row.id, taskId: row.taskId, body: row.body, createdAt: new Date(row.createdAt).toISOString(), author });

/** Oldest first; null when the task is missing or not the user's. */
export async function listComments(userId: string, taskId: string): Promise<CommentDto[] | null> {
  if (!await ownsTask(userId, taskId)) return null;
  const [rows, author] = await Promise.all([
    db.select(columns).from(taskComments).where(and(eq(taskComments.taskId, taskId), eq(taskComments.userId, userId))).orderBy(asc(taskComments.createdAt), asc(taskComments.id)),
    authorOf(userId),
  ]);
  return rows.map(row => toDto(row, author));
}

/**
 * Adds a comment; null when the task is missing or not the user's. A replayed
 * ID returns the comment it already wrote; another user's ID is "conflict".
 */
export async function addComment(userId: string, taskId: string, input: CommentInput): Promise<CommentDto | null | "conflict"> {
  const { id, body } = commentInput.parse(input);
  if (!await ownsTask(userId, taskId)) return null;
  await db.insert(taskComments).values({ id, userId, taskId, body, createdAt: new Date() }).onConflictDoNothing();
  const [row] = await db.select(columns).from(taskComments)
    .where(and(eq(taskComments.id, id), eq(taskComments.userId, userId), eq(taskComments.taskId, taskId))).limit(1);
  return row ? toDto(row, await authorOf(userId)) : "conflict";
}

/** false when the comment is missing or not the user's (already gone). */
export async function deleteComment(userId: string, id: string): Promise<boolean> {
  const deleted = await db.delete(taskComments).where(and(eq(taskComments.id, id), eq(taskComments.userId, userId))).returning({ id: taskComments.id });
  return deleted.length > 0;
}

/** The user's comments among `ids` (the live sync delta). */
export async function getCommentsByIds(userId: string, ids: string[]): Promise<CommentDto[]> {
  if (!ids.length) return [];
  const [rows, author] = await Promise.all([
    db.select(columns).from(taskComments).where(and(eq(taskComments.userId, userId), inArray(taskComments.id, ids))),
    authorOf(userId),
  ]);
  return rows.map(row => toDto(row, author));
}
