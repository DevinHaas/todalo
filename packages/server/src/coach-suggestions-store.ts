// Goals ticket 25: the Coach's cached goal suggestions per task and the
// primary-goal capacity row. Every read and write is scoped to the caller's userId.
import { and, eq } from "drizzle-orm";
import { db } from "@todalo/db";
import { coachCapacity, coachGoalSuggestions } from "@todalo/db/schema";
import type { CapacityGoalDto } from "./coach-suggestions";

export async function getCachedGoalSuggestions(userId: string, taskId: string) {
  const [row] = await db.select({ inputsHash: coachGoalSuggestions.inputsHash, goalIds: coachGoalSuggestions.goalIds }).from(coachGoalSuggestions)
    .where(and(eq(coachGoalSuggestions.userId, userId), eq(coachGoalSuggestions.taskId, taskId)));
  return row ?? null;
}

/** The route checked the task is the user's. */
export async function cacheGoalSuggestions(userId: string, taskId: string, inputsHash: string, goalIds: string[]) {
  await db.insert(coachGoalSuggestions).values({ userId, taskId, inputsHash, goalIds })
    .onConflictDoUpdate({ target: [coachGoalSuggestions.userId, coachGoalSuggestions.taskId], set: { inputsHash, goalIds, createdAt: new Date() } });
}

export async function getCapacity(userId: string) {
  const [row] = await db.select({ availableMinutes: coachCapacity.availableMinutes, inputsHash: coachCapacity.inputsHash, estimate: coachCapacity.estimate })
    .from(coachCapacity).where(eq(coachCapacity.userId, userId));
  return row ?? null;
}

export async function saveAvailableMinutes(userId: string, availableMinutes: number | null) {
  await db.insert(coachCapacity).values({ userId, availableMinutes })
    .onConflictDoUpdate({ target: coachCapacity.userId, set: { availableMinutes } });
}

export async function cacheCapacity(userId: string, inputsHash: string, estimate: CapacityGoalDto[]) {
  await db.insert(coachCapacity).values({ userId, inputsHash, estimate })
    .onConflictDoUpdate({ target: coachCapacity.userId, set: { inputsHash, estimate } });
}
