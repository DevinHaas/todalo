// Server-only ritual storage for /api/v1 (goals ticket 11). Every read and write
// is scoped to the owner. The Check-in item on the schedule is an ordinary
// daily recurring task, written through tasks.ts so Google Calendar sync and the
// live delta treat it like any other scheduled task.
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@todalo/db";
import { goals, progressRatings, ritualRuns, ritualSettings, tasks } from "@todalo/db/schema";
import { createTask, deleteTask, updateTask } from "./tasks";
import { defaultRitualSettings, type RitualKind, type RitualRunDto, type RitualRunInput, type RitualSettingsDto, type RitualSettingsInput, type RunStatus } from "./ritual-dto";

const kinds = { checkIn: "check_in", weeklyReview: "weekly_review", seasonReview: "season_review" } as const;
/** The Check-in item's length on the schedule. */
export const CHECK_IN_MINUTES = 15;

export async function getRitualSettings(userId: string): Promise<{ settings: RitualSettingsDto; checkInTaskId: string | null }> {
  const [row] = await db.select().from(ritualSettings).where(eq(ritualSettings.userId, userId));
  if (!row) return { settings: defaultRitualSettings, checkInTaskId: null };
  return {
    settings: {
      checkIn: { enabled: row.checkInEnabled, time: row.checkInTime },
      weeklyReview: { enabled: row.weeklyReviewEnabled, day: row.weeklyReviewDay, time: row.weeklyReviewTime },
      seasonReview: { enabled: row.seasonReviewEnabled },
    },
    checkInTaskId: row.checkInTaskId,
  };
}

export async function saveRitualSettings(userId: string, { checkIn, weeklyReview, seasonReview }: RitualSettingsInput): Promise<void> {
  const values = {
    checkInEnabled: checkIn.enabled, checkInTime: checkIn.time,
    weeklyReviewEnabled: weeklyReview.enabled, weeklyReviewDay: weeklyReview.day, weeklyReviewTime: weeklyReview.time,
    seasonReviewEnabled: seasonReview.enabled,
  };
  await db.insert(ritualSettings).values({ userId, ...values }).onConflictDoUpdate({ target: ritualSettings.userId, set: values });
}

export async function getRunStatus(userId: string, kind: RitualKind, period: string): Promise<RunStatus | null> {
  const [row] = await db.select({ status: ritualRuns.status }).from(ritualRuns)
    .where(and(eq(ritualRuns.userId, userId), eq(ritualRuns.kind, kinds[kind]), eq(ritualRuns.period, period)));
  return row?.status ?? null;
}

/** Records (or replaces) one run with its ratings; null when a rated goal is missing, foreign or archived. */
export async function recordRun(userId: string, input: RitualRunInput): Promise<RitualRunDto | null> {
  const goalIds = input.ratings.map(rating => rating.goalId);
  if (goalIds.length) {
    const owned = await db.select({ id: goals.id }).from(goals).where(and(eq(goals.userId, userId), inArray(goals.id, goalIds), isNull(goals.archivedAt)));
    if (owned.length !== goalIds.length) return null;
  }
  const [run] = await db.insert(ritualRuns).values({ userId, kind: kinds[input.kind], period: input.period, status: input.status, planning: input.planning })
    .onConflictDoUpdate({ target: [ritualRuns.userId, ritualRuns.kind, ritualRuns.period], set: { status: input.status, planning: input.planning, updatedAt: new Date() } })
    .returning({ id: ritualRuns.id });
  // ponytail: delete-then-insert without a transaction (neon-http); a crash in between leaves the run with fewer ratings, a redo fixes it.
  await db.delete(progressRatings).where(and(eq(progressRatings.userId, userId), eq(progressRatings.runId, run.id)));
  if (input.ratings.length) await db.insert(progressRatings).values(input.ratings.map(rating => ({ userId, runId: run.id, ...rating })));
  return { id: run.id, kind: input.kind, period: input.period, status: input.status, ratings: input.ratings, planning: input.planning };
}

/** The Check-in task's current start, or null when there is none (never created, or deleted by hand). */
export async function getCheckInTask(userId: string): Promise<{ id: string; dueDate: Date | null } | null> {
  const [row] = await db.select({ id: tasks.id, dueDate: tasks.dueDate }).from(ritualSettings)
    .innerJoin(tasks, and(eq(tasks.id, ritualSettings.checkInTaskId), eq(tasks.userId, userId)))
    .where(eq(ritualSettings.userId, userId));
  return row ?? null;
}

/**
 * Puts the Check-in task at `start` (creating it when missing) or, with null,
 * deletes it (and its calendar event). Returns the task ID, or null when removed.
 */
export async function placeCheckIn(userId: string, start: Date | null): Promise<string | null> {
  const existing = await getCheckInTask(userId);
  if (!start) {
    if (existing) await deleteTask(userId, existing.id);
    return null;
  }
  const dueDateEnd = new Date(start.getTime() + CHECK_IN_MINUTES * 60_000);
  if (existing) {
    if (existing.dueDate?.getTime() !== start.getTime()) await updateTask(userId, { id: existing.id, dueDate: start, dueDateEnd, status: "todo" });
    return existing.id;
  }
  const { id } = await createTask(userId, {
    title: "Check-in", description: "Reflect on yesterday's goals. Open it to start the Check-in.",
    dueDate: start, dueDateEnd, recurrence: { n: 1, unit: "day", basedOn: "scheduled", until: null },
  });
  await db.insert(ritualSettings).values({ userId, checkInTaskId: id })
    .onConflictDoUpdate({ target: ritualSettings.userId, set: { checkInTaskId: id } });
  return id;
}
