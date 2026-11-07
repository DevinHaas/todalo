// Live sync's database source (contract and assembly in ./sync-delta.ts).
// Server-only. The change log is written by triggers (drizzle/0024_sync_changes.sql),
// so every write path (API, bulk, imports, Ramble, Google inbound) is covered.
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@todalo/db";
import { labels, projects, savedFilters, syncChanges } from "@todalo/db/schema";
import { buildDelta, type SyncSource } from "./sync-delta";
import { getTasksByIds } from "./today";
import { toTaskDto } from "./task-dto";
import { toProjectDto } from "./project-dto";
import { toLabelDto, toSavedFilterDto } from "./metadata-input";
import { getCommentsByIds } from "./comments";

export const syncSource: SyncSource = {
  async cursor() {
    const result = await db.execute<{ cursor: string }>(sql`select pg_snapshot_xmin(pg_current_snapshot())::text as cursor`);
    return Number(result.rows[0]!.cursor);
  },
  changes: (userId, since, limit) => db.select({ entity: syncChanges.entity, entityId: syncChanges.entityId }).from(syncChanges)
    .where(and(eq(syncChanges.userId, userId), gte(syncChanges.xid, since))).limit(limit),
  tasks: async (userId, ids) => (await getTasksByIds(userId, ids)).map(toTaskDto),
  projects: async (userId, ids) => (await db.select().from(projects).where(and(eq(projects.userId, userId), inArray(projects.id, ids)))).map(toProjectDto),
  labels: async (userId, ids) => (await db.select().from(labels).where(and(eq(labels.userId, userId), inArray(labels.id, ids)))).map(toLabelDto),
  filters: async (userId, ids) => (await db.select().from(savedFilters).where(and(eq(savedFilters.userId, userId), inArray(savedFilters.id, ids)))).map(toSavedFilterDto),
  comments: getCommentsByIds,
};

export const getSyncDelta = (userId: string, since: string | null | undefined) => buildDelta(syncSource, userId, since);
