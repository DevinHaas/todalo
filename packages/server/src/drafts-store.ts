// Goals ticket 19: Coach Drafts in the database. The Coach only ever reaches
// saveDraft; tasks change only through resolveDraft, when the user accepts.
// Every read and write is scoped to the caller's userId.
import { and, asc, eq, inArray } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { db } from "@todalo/db";
import { coachDraftItems, coachDrafts, goalTasks, tasks, userSettings } from "@todalo/db/schema";
import { atomically } from "./bulk";
import { getCalendarEventsForUser } from "./calendar-connections";
import { getGoalLinks } from "./goals";
import { getRitualSettings } from "./rituals";
import { getCurrentSeason } from "./seasons";
import { syncToCalendar } from "./tasks";
import type { AcceptedWrite, DayContext, DraftRecord, DraftTask, NewDraft } from "./drafts";

const taskColumns = { id: tasks.id, title: tasks.title, status: tasks.status, projectId: tasks.projectId, parentId: tasks.parentId, dueDate: tasks.dueDate, dueDateEnd: tasks.dueDateEnd, updatedAt: tasks.updatedAt };

export async function getDayContext(userId: string): Promise<DayContext> {
  // Ticket 28: the events Today shows (enabled calendars, accounts showing events, no echoes of our own tasks).
  const [rows, current, links, rituals, events, [settings]] = await Promise.all([
    db.select(taskColumns).from(tasks).where(eq(tasks.userId, userId)),
    getCurrentSeason(userId), getGoalLinks(userId), getRitualSettings(userId), getCalendarEventsForUser(userId),
    db.select({ share: userSettings.coachShareEventTitles }).from(userSettings).where(eq(userSettings.userId, userId)),
  ]);
  return {
    tasks: rows, links,
    goals: (current?.goals ?? []).map(goal => ({ goalId: goal.goalId, title: goal.title, tier: goal.tier, archivedAt: goal.archivedAt })),
    fixedTaskIds: Object.values(rituals.taskIds).filter(id => id !== null),
    events: events.map(({ title, start, end, allDay }) => ({ title, start, end, allDay })),
    shareEventTitles: settings?.share ?? false,
  };
}

export const getDraftTasks = (userId: string, ids: string[]): Promise<DraftTask[]> =>
  ids.length ? db.select(taskColumns).from(tasks).where(and(eq(tasks.userId, userId), inArray(tasks.id, ids))) : Promise.resolve([]);

/** The user's open drafts (or one of them), with every item in order. */
export async function getOpenDrafts(userId: string, draftId?: string): Promise<DraftRecord[]> {
  const drafts = await db.select().from(coachDrafts)
    .where(and(eq(coachDrafts.userId, userId), eq(coachDrafts.status, "open"), draftId ? eq(coachDrafts.id, draftId) : undefined)).orderBy(asc(coachDrafts.createdAt));
  if (!drafts.length) return [];
  const items = await db.select().from(coachDraftItems)
    .where(and(eq(coachDraftItems.userId, userId), inArray(coachDraftItems.draftId, drafts.map(draft => draft.id)))).orderBy(asc(coachDraftItems.position));
  return drafts.map(draft => ({ ...draft, items: items.filter(item => item.draftId === draft.id) }));
}

/** Stores a new draft, closing the open one of the same kind and period in the same batch. */
export async function saveDraft(userId: string, draft: NewDraft): Promise<DraftRecord> {
  const id = crypto.randomUUID();
  const items = draft.items.map((item, position) => ({ ...item, criteria: item.criteria ?? null, id: crypto.randomUUID(), userId, draftId: id, position, state: "pending" as const }));
  const writes: BatchItem<"pg">[] = [
    db.update(coachDrafts).set({ status: "closed" }).where(and(eq(coachDrafts.userId, userId), eq(coachDrafts.kind, draft.kind), eq(coachDrafts.period, draft.period), eq(coachDrafts.status, "open"))),
    db.insert(coachDrafts).values({ id, userId, kind: draft.kind, period: draft.period, summary: draft.summary, overflow: draft.overflow ?? null }),
  ];
  if (items.length) writes.push(db.insert(coachDraftItems).values(items));
  await atomically(writes);
  return (await getOpenDrafts(userId, id))[0]!;
}

/**
 * Accepts and declines items in one batch: new tasks (linked to their goal)
 * and time changes, the items' states, and the draft closed once nothing is
 * pending. Only then the calendar push, task by task (the existing sync).
 * ponytail: the caller's stale check (planAccept) and this batch are separate
 * statements (no neon-http interactive transactions); an edit landing in
 * between is last-write-wins, as in updateTask.
 */
export async function resolveDraft(userId: string, draft: DraftRecord, { accepted, declined }: { accepted: AcceptedWrite[]; declined: string[] }) {
  const writes: BatchItem<"pg">[] = [];
  const touched: string[] = [];
  for (const write of accepted) {
    const times = { dueDate: write.dueDate, dueDateEnd: write.dueDateEnd };
    if (write.taskId) {
      writes.push(db.update(tasks).set({ ...times, updatedAt: new Date() }).where(and(eq(tasks.id, write.taskId), eq(tasks.userId, userId))));
      touched.push(write.taskId);
    } else {
      // A new task lands in the Inbox; the item keeps pointing at it.
      const taskId = crypto.randomUUID();
      writes.push(db.insert(tasks).values({ id: taskId, userId, title: write.title, ...times }));
      // Ticket 23: a drafted milestone is the goal link with its done criteria (milestones.ts).
      const milestoneCriteria = write.criteria?.map(text => ({ text, done: false })) ?? null;
      if (write.goalId) writes.push(db.insert(goalTasks).values({ userId, goalId: write.goalId, taskId, milestoneCriteria }).onConflictDoNothing());
      writes.push(db.update(coachDraftItems).set({ taskId }).where(and(eq(coachDraftItems.id, write.itemId), eq(coachDraftItems.userId, userId))));
      touched.push(taskId);
    }
  }
  const decide = (ids: string[], state: "accepted" | "declined") => {
    if (ids.length) writes.push(db.update(coachDraftItems).set({ state }).where(and(eq(coachDraftItems.userId, userId), eq(coachDraftItems.draftId, draft.id), inArray(coachDraftItems.id, ids))));
  };
  decide(accepted.map(write => write.itemId), "accepted");
  decide(declined, "declined");
  const decided = new Set([...accepted.map(write => write.itemId), ...declined]);
  // Ticket 28: a draft with overflow still to answer stays open.
  if (!draft.overflow?.length && draft.items.every(item => item.state !== "pending" || decided.has(item.id))) {
    writes.push(db.update(coachDrafts).set({ status: "closed" }).where(and(eq(coachDrafts.id, draft.id), eq(coachDrafts.userId, userId))));
  }
  await atomically(writes);
  for (const taskId of touched) await syncToCalendar(userId, taskId);
}

/** Ticket 28: the overflow answered (scheduled or dropped); the draft closes when nothing else is pending. */
export async function settleOverflow(userId: string, draft: DraftRecord) {
  const done = draft.items.every(item => item.state !== "pending");
  await db.update(coachDrafts).set({ overflow: null, ...(done && { status: "closed" as const }) }).where(and(eq(coachDrafts.id, draft.id), eq(coachDrafts.userId, userId)));
}
