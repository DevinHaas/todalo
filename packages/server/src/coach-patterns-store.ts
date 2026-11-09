// Goals ticket 24: the user's Patterns in the database, scoped to the caller's userId.
import { and, asc, eq } from "drizzle-orm";
import { db } from "@todalo/db";
import { coachPatterns } from "@todalo/db/schema";
import type { NewPattern, PatternRecord } from "./coach-patterns";

const columns = {
  id: coachPatterns.id, statement: coachPatterns.statement, evidence: coachPatterns.evidence, source: coachPatterns.source,
  learnedAt: coachPatterns.learnedAt, editedAt: coachPatterns.editedAt,
};

/** Oldest first, the order they were learned in. */
export const getPatterns = (userId: string): Promise<PatternRecord[]> =>
  db.select(columns).from(coachPatterns).where(eq(coachPatterns.userId, userId)).orderBy(asc(coachPatterns.learnedAt), asc(coachPatterns.id));

export async function addPatterns(userId: string, patterns: NewPattern[], at: Date) {
  // A millisecond apart, so the order survives.
  if (patterns.length) await db.insert(coachPatterns).values(patterns.map((pattern, index) => ({ ...pattern, userId, learnedAt: new Date(at.getTime() + index) })));
}

/** False when the user has no such pattern. */
export async function updatePattern(userId: string, id: string, statement: string, at: Date) {
  const rows = await db.update(coachPatterns).set({ statement, editedAt: at })
    .where(and(eq(coachPatterns.userId, userId), eq(coachPatterns.id, id))).returning({ id: coachPatterns.id });
  return rows.length > 0;
}

export async function removePattern(userId: string, id: string) {
  const rows = await db.delete(coachPatterns).where(and(eq(coachPatterns.userId, userId), eq(coachPatterns.id, id))).returning({ id: coachPatterns.id });
  return rows.length > 0;
}
