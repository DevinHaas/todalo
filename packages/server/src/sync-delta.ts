// Live sync: the delta contract (client-safe types) and how one is assembled
// from a change source. Pure apart from the source it is given; the database
// source is ./sync.ts, tests pass an in-memory one.
//
// GET /api/v1/sync?since=<cursor> answers what changed for the user since the
// cursor a previous answer gave. A cursor is a Postgres snapshot xmin: every
// transaction below it has committed, so taking it before reading the change
// log never skips a late commit (at worst a change is sent twice; merging is
// idempotent). No `since`, an unknown cursor or too many changes answer
// `full: true`: the client refetches every read and keeps the new cursor.
import type { TaskDto } from "./task-dto";
import type { ProjectDto } from "./project-dto";
import type { LabelDto, SavedFilterDto } from "./metadata-input";
import type { CommentDto } from "./comment-dto";

/** Entities the client merges row by row into its cached reads. */
export const mergedKinds = ["task", "project", "label", "filter", "comment"] as const;
export type MergedKind = (typeof mergedKinds)[number];
/** Entities whose reads are derived (manual order, progress, joins): the client refetches those reads. */
export const refetchedKinds = ["section", "goal", "goalLink", "season", "ritual"] as const;
export type RefetchedKind = (typeof refetchedKinds)[number];

export interface SyncDelta {
  cursor: string;
  full: boolean;
  tasks: TaskDto[];
  projects: ProjectDto[];
  labels: LabelDto[];
  filters: SavedFilterDto[];
  comments: CommentDto[];
  /** IDs changed since the cursor whose entity no longer exists (tombstones). */
  deleted: Record<MergedKind, string[]>;
  changed: RefetchedKind[];
}

export interface SyncSource {
  /** The current snapshot xmin. */
  cursor(): Promise<number>;
  /** The user's change-log rows written by transactions at or after `since`, at most `limit`. */
  changes(userId: string, since: number, limit: number): Promise<{ entity: string; entityId: string }[]>;
  tasks(userId: string, ids: string[]): Promise<TaskDto[]>;
  projects(userId: string, ids: string[]): Promise<ProjectDto[]>;
  labels(userId: string, ids: string[]): Promise<LabelDto[]>;
  filters(userId: string, ids: string[]): Promise<SavedFilterDto[]>;
  comments(userId: string, ids: string[]): Promise<CommentDto[]>;
}

/** More changes than this is a long absence: a full refetch is cheaper than the delta. */
export const MAX_DELTA = 500;

export const parseCursor = (value: string | null | undefined) => typeof value === "string" && /^\d{1,15}$/.test(value) ? Number(value) : null;

const blank = (cursor: number, full: boolean): SyncDelta => ({
  cursor: String(cursor), full, tasks: [], projects: [], labels: [], filters: [], comments: [],
  deleted: { task: [], project: [], label: [], filter: [], comment: [] }, changed: [],
});

export async function buildDelta(source: SyncSource, userId: string, since: string | null | undefined): Promise<SyncDelta> {
  // The cursor is taken first: anything committing later is at or above it.
  const cursor = await source.cursor();
  const from = parseCursor(since);
  // A cursor ahead of the server's came from another database (restore, branch).
  if (from === null || from > cursor) return blank(cursor, true);
  const rows = await source.changes(userId, from, MAX_DELTA + 1);
  if (rows.length > MAX_DELTA) return blank(cursor, true);
  const ids = (entity: string) => [...new Set(rows.filter(row => row.entity === entity).map(row => row.entityId))];
  const delta = blank(cursor, false);
  const load = async <T extends { id: string },>(kind: MergedKind, read: (ids: string[]) => Promise<T[]>) => {
    const wanted = ids(kind);
    const found = wanted.length ? await read(wanted) : [];
    const present = new Set(found.map(row => row.id));
    delta.deleted[kind] = wanted.filter(id => !present.has(id));
    return found;
  };
  [delta.tasks, delta.projects, delta.labels, delta.filters, delta.comments] = await Promise.all([
    load("task", ids => source.tasks(userId, ids)), load("project", ids => source.projects(userId, ids)),
    load("label", ids => source.labels(userId, ids)), load("filter", ids => source.filters(userId, ids)),
    load("comment", ids => source.comments(userId, ids)),
  ]);
  delta.changed = refetchedKinds.filter(kind => rows.some(row => row.entity === kind));
  return delta;
}
