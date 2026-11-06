// DB side of the Todoist import: load what is already imported, then insert a
// planned import (from todoist-import.ts) in one Neon batch (one transaction).
import { db } from "@todalo/db";
import { importMappings, labels, projects, sections, taskComments, taskLabels, tasks, user, userSettings } from "@todalo/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { TODOIST, type ImportContext, type ImportPlan, type MappingKind } from "./todoist-import";

const tables = { project: projects, section: sections, task: tasks, label: labels } as const;

/** Mappings whose local row still exists; stale ones are deleted so the item can be imported again. */
export async function loadImportContext(userId: string, timeZone: string): Promise<ImportContext> {
  const rows = await db.select().from(importMappings).where(and(eq(importMappings.userId, userId), eq(importMappings.provider, TODOIST)));
  const mapped = new Map<string, string>();
  const stale: string[] = [];
  for (const kind of Object.keys(tables) as MappingKind[]) {
    const ofKind = rows.filter((r) => r.kind === kind);
    if (!ofKind.length) continue;
    const table = tables[kind];
    const live = new Set((await db.select({ id: table.id }).from(table).where(and(eq(table.userId, userId), inArray(table.id, ofKind.map((r) => r.localId))))).map((r) => r.id));
    for (const row of ofKind) live.has(row.localId) ? mapped.set(`${kind}:${row.externalId}`, row.localId) : stale.push(row.id);
  }
  if (stale.length) await db.delete(importMappings).where(and(eq(importMappings.userId, userId), inArray(importMappings.id, stale)));
  const existingLabels = await db.select({ id: labels.id, name: labels.name }).from(labels).where(eq(labels.userId, userId));
  return { mapped, existingLabels, timeZone };
}

// ponytail: fixed chunk size keeps each statement's parameter count well under
// Postgres' 65k limit for any realistic Todoist account.
const chunks = <T>(rows: T[], size = 500) => Array.from({ length: Math.ceil(rows.length / size) }, (_, i) => rows.slice(i * size, (i + 1) * size));

export async function applyImportPlan(userId: string, plan: ImportPlan) {
  const own = <T extends object>(rows: T[]) => rows.map((row) => ({ ...row, userId }));
  // Parents before sub-tasks (level by level) so the self-reference is satisfied statement by statement.
  const levels: ImportPlan["tasks"][] = [];
  let pending = plan.tasks, placed = new Set<string>();
  while (pending.length) {
    const level = pending.filter((t) => !t.parentId || placed.has(t.parentId) || !pending.some((p) => p.id === t.parentId));
    if (!level.length) throw new Error("Import plan has a sub-task loop");
    levels.push(level);
    placed = new Set([...placed, ...level.map((t) => t.id)]);
    pending = pending.filter((t) => !level.includes(t));
  }
  const statements = [
    ...chunks(own(plan.projects)).map((rows) => db.insert(projects).values(rows)),
    ...chunks(own(plan.sections)).map((rows) => db.insert(sections).values(rows)),
    ...chunks(own(plan.labels)).map((rows) => db.insert(labels).values(rows)),
    ...levels.flatMap((level) => chunks(own(level)).map((rows) => db.insert(tasks).values(rows))),
    ...chunks(own(plan.taskLabels)).map((rows) => db.insert(taskLabels).values(rows)),
    ...chunks(own(plan.comments)).map((rows) => db.insert(taskComments).values(rows)),
    ...chunks(own(plan.mappings.map((m) => ({ ...m, provider: TODOIST })))).map((rows) => db.insert(importMappings).values(rows)),
  ];
  if (!statements.length) return;
  const [first, ...rest] = statements;
  await db.batch([first, ...rest]);
}

const PROMPT_WINDOW = 24 * 60 * 60_000;

/** The post-sign-up "Import from Todoist?" prompt: new accounts (under a day old) that have not answered it. */
export async function importPromptDue(userId: string, now = new Date()) {
  const [row] = await db.select({ createdAt: user.createdAt, seenAt: userSettings.importPromptSeenAt })
    .from(user).leftJoin(userSettings, eq(userSettings.userId, user.id)).where(eq(user.id, userId));
  return Boolean(row && !row.seenAt && now.getTime() - row.createdAt.getTime() < PROMPT_WINDOW);
}

export async function markImportPromptSeen(userId: string) {
  const now = new Date();
  await db.insert(userSettings).values({ userId, importPromptSeenAt: now })
    .onConflictDoUpdate({ target: userSettings.userId, set: { importPromptSeenAt: now, updatedAt: now } });
}
