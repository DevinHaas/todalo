// Goals ticket 19: Coach Drafts in the database. The Coach only ever reaches
// saveDraft; tasks change only through resolveDraft, when the user accepts.
// Every read and write is scoped to the caller's userId.
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { db } from "@todalo/db";
import { coachDocuments, coachDraftItems, coachDrafts, goalTasks, taskAttachments, tasks, userSettings } from "@todalo/db/schema";
import { atomically, completeTasks, deleteTasks } from "./bulk";
import { getCalendarEventsForUser } from "./calendar-connections";
import { getGoalLinks } from "./goals";
import { getOrganizationDestinations, moveTasks } from "./organization";
import { getRitualSettings } from "./rituals";
import { getCurrentSeason } from "./seasons";
import { syncToCalendar } from "./tasks";
import { planDecline, type AcceptedWrite, type DayContext, type DraftRecord, type DraftTask, type NewDraft } from "./drafts";
import type { DraftRevision } from "./coach-chat";

// Ticket 31: horizon, priority and createdAt rank the tasks to plan.
const taskColumns = {
  id: tasks.id, title: tasks.title, status: tasks.status, projectId: tasks.projectId, parentId: tasks.parentId, dueDate: tasks.dueDate, dueDateEnd: tasks.dueDateEnd, updatedAt: tasks.updatedAt,
  horizon: tasks.horizon, priority: tasks.priority, createdAt: tasks.createdAt,
  // Ticket 32: what makes a task stale.
  reviewedAt: tasks.reviewedAt,
};

export async function getDayContext(userId: string): Promise<DayContext> {
  // Ticket 28: the events Today shows (enabled calendars, accounts showing events, no echoes of our own tasks).
  // Ticket 30: and the projects and sections a chat move may use.
  const [rows, current, links, rituals, events, [settings], destinations] = await Promise.all([
    db.select(taskColumns).from(tasks).where(eq(tasks.userId, userId)),
    getCurrentSeason(userId), getGoalLinks(userId), getRitualSettings(userId), getCalendarEventsForUser(userId),
    db.select({ share: userSettings.coachShareEventTitles }).from(userSettings).where(eq(userSettings.userId, userId)),
    getOrganizationDestinations(userId),
  ]);
  return {
    tasks: rows, links,
    goals: (current?.goals ?? []).map(goal => ({ goalId: goal.goalId, title: goal.title, tier: goal.tier, archivedAt: goal.archivedAt })),
    fixedTaskIds: Object.values(rituals.taskIds).filter(id => id !== null),
    events: events.map(({ title, start, end, allDay }) => ({ title, start, end, allDay })),
    shareEventTitles: settings?.share ?? false,
    destinations,
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
  const ids = draft.items.map(() => crypto.randomUUID());
  // Ticket 29: a sub-task or attachment under a new task of this draft points at that task's item.
  const items = draft.items.map(({ parentIndex, ...item }, position) => ({
    ...item, criteria: item.criteria ?? null, parentItemId: parentIndex === undefined ? null : ids[parentIndex]!, id: ids[position]!, userId, draftId: id, position, state: "pending" as const,
  }));
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
 * Ticket 30: after the batch, moves to another place, completions and deletions
 * go through the app's own commands (moveTasks, completeTasks, deleteTasks:
 * recurring tasks advance, sub-tasks move and go along, calendar events follow).
 * ponytail: those run after the items are marked accepted; a failure there
 * leaves the item accepted with the task unchanged (the toast says the accept
 * failed, and the task is still there to change by hand).
 */
export async function resolveDraft(userId: string, draft: DraftRecord, { accepted, declined }: { accepted: AcceptedWrite[]; declined: string[] }) {
  const writes: BatchItem<"pg">[] = [];
  const touched: string[] = [];
  // Ticket 29: what sub-tasks and attachments need: their existing parents' place and the documents' bytes.
  const parentIds = [...new Set(accepted.flatMap(write => write.op === "subtask" && write.parentId ? [write.parentId] : []))];
  const documentIds = [...new Set(accepted.flatMap(write => write.documentId ? [write.documentId] : []))];
  const [parents, documents] = await Promise.all([
    parentIds.length ? db.select({ id: tasks.id, projectId: tasks.projectId, sectionId: tasks.sectionId }).from(tasks).where(and(eq(tasks.userId, userId), inArray(tasks.id, parentIds))) : [],
    documentIds.length ? db.select().from(coachDocuments).where(and(eq(coachDocuments.userId, userId), inArray(coachDocuments.id, documentIds))) : [],
  ]);
  // A new task's ID by its item, for what goes under it (created in this batch or accepted earlier).
  const created = new Map(draft.items.flatMap(item => item.taskId && item.state === "accepted" ? [[item.id, item.taskId] as const] : []));
  const parentOf = (write: AcceptedWrite) => write.parentId ?? created.get(write.parentItemId ?? "") ?? null;
  const completed: string[] = [], deleted: string[] = [];
  for (const write of accepted) {
    const times = { dueDate: write.dueDate, dueDateEnd: write.dueDateEnd };
    if (write.op === "complete" || write.op === "delete") (write.op === "complete" ? completed : deleted).push(write.taskId!);
    // Ticket 31: a new horizon only (its times stay).
    // Ticket 32: a Keep is not an edit: only the stamp that makes the task fresh again (updatedAt stays, open editors stay valid).
    else if (write.op === "keep") writes.push(db.update(tasks).set({ reviewedAt: new Date(), updatedAt: sql`${tasks.updatedAt}` }).where(and(eq(tasks.id, write.taskId!), eq(tasks.userId, userId))));
    else if (write.op === "horizon") writes.push(db.update(tasks).set({ horizon: write.horizon ?? null, updatedAt: new Date() }).where(and(eq(tasks.id, write.taskId!), eq(tasks.userId, userId))));
    else if (write.place?.keepsDate) continue;
    else if (write.op === "subtask") {
      const parentId = parentOf(write);
      const place = parents.find(row => row.id === parentId) ?? { projectId: null, sectionId: null };
      const taskId = crypto.randomUUID();
      writes.push(db.insert(tasks).values({ id: taskId, userId, title: write.title, parentId, projectId: place.projectId, sectionId: place.sectionId }));
      writes.push(db.update(coachDraftItems).set({ taskId }).where(and(eq(coachDraftItems.id, write.itemId), eq(coachDraftItems.userId, userId))));
      created.set(write.itemId, taskId);
    } else if (write.op === "attach") {
      const taskId = parentOf(write);
      const document = documents.find(row => row.id === write.documentId);
      if (taskId && document) writes.push(db.insert(taskAttachments).values({ userId, taskId, name: document.name, mediaType: document.mediaType, byteSize: document.byteSize, content: document.content }));
    } else if (write.taskId) {
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
      created.set(write.itemId, taskId);
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
  for (const write of accepted) if (write.place) await moveTasks(userId, [write.taskId!], { projectId: write.place.projectId, sectionId: write.place.sectionId });
  for (const taskId of touched) await syncToCalendar(userId, taskId);
  // The accept is the user's confirmation, also of a milestone's open done criteria.
  if (completed.length) await completeTasks(userId, completed.map(id => ({ id })), undefined, true);
  if (deleted.length) await deleteTasks(userId, deleted);
}

/** Ticket 28: the overflow answered (scheduled or dropped); the draft closes when nothing else is pending. */
export async function settleOverflow(userId: string, draft: DraftRecord) {
  const done = draft.items.every(item => item.state !== "pending");
  await db.update(coachDrafts).set({ overflow: null, ...(done && { status: "closed" as const }) }).where(and(eq(coachDrafts.id, draft.id), eq(coachDrafts.userId, userId)));
}

/**
 * The Coach revised pending items of an open draft from the chat: new times
 * and names in one batch; dropped ones (with what goes under them) declined as
 * the Decline button does, closing the draft when nothing is left.
 * ponytail: two statements when both kinds come at once (no interactive transactions).
 */
export async function reviseDraft(userId: string, draft: DraftRecord, revisions: readonly DraftRevision[]) {
  const writes: BatchItem<"pg">[] = revisions.filter(revision => !revision.drop && (revision.startAt || revision.rename)).map(revision => db.update(coachDraftItems)
    .set({ ...(revision.startAt && { startAt: revision.startAt, endAt: revision.endAt ?? null }), ...(revision.rename && { title: revision.rename }) })
    .where(and(eq(coachDraftItems.id, revision.itemId), eq(coachDraftItems.userId, userId), eq(coachDraftItems.draftId, draft.id), eq(coachDraftItems.state, "pending"))));
  if (writes.length) await atomically(writes);
  const dropped = revisions.filter(revision => revision.drop).map(revision => revision.itemId);
  const declined = dropped.length ? planDecline(draft, dropped) : [];
  if (declined !== "missing" && declined.length) await resolveDraft(userId, draft, { accepted: [], declined });
}
