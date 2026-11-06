import { useMemo, useState } from "react";
import { useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Account } from "./session";
import { metadata, metadataReads, projectReads, reads } from "./runtime";
import { metadataMutations } from "./metadata";
import { listBuckets, MetadataDirectory, TaskCollectionView, type CollectionSlots, type MetadataActions } from "./metadata-views";
import { useTaskWrites } from "./task-writes";
import type { TaskDto } from "./tasks";
import { useBulkSelection } from "./bulk-screens";
import { useDisplay } from "./schedule-views";
import { BoardScreen } from "./board-screens";
import { ProjectCalendar } from "./schedule-screens";

function useProjectNames(userId: string) {
  const projects = useQuery(projectReads.list(userId));
  return { projects: projects.data ?? [], names: Object.fromEntries((projects.data ?? []).map(project => [project.id, project.name])) };
}

/** /labels and /filters (legacy MetadataDirectory). */
export function MetadataScreen({ account, mode }: { account: Account; mode: "labels" | "filters" }) {
  const userId = account.user.id;
  const cache = useQueryClient();
  const query = useQuery(metadataReads.list(userId));
  const { projects } = useProjectNames(userId);
  const writes = useMemo(() => metadataMutations(metadata, cache, userId), [cache, userId]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One write at a time, as the legacy transition did; failures stay on screen.
  const run = async (write: () => Promise<unknown>) => {
    setPending(true); setError(null);
    try { await write(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Your changes could not be saved. Try again."); throw reason; }
    finally { setPending(false); }
  };
  const actions: MetadataActions = {
    saveLabel: (id, label, operation) => run(() => id ? writes.updateLabel(id, label) : writes.createLabel(operation, label)),
    deleteLabel: (id) => run(() => writes.removeLabel(id)),
    saveFilter: (id, filter, operation) => run(() => id ? writes.updateFilter(id, filter) : writes.createFilter(operation, filter)),
    deleteFilter: (id) => run(() => writes.removeFilter(id)),
  };
  return <MetadataDirectory key={mode} mode={mode} state={query} onRetry={() => void query.refetch()} projects={projects} actions={actions} write={{ pending, error }} />;
}

/**
 * What a legacy ViewSwitcher gave every task collection (labels, filters,
 * Inbox, search): row writes, selection on the list and the Display layout.
 */
export function useCollection(account: Account, tasks: TaskDto[]): { slots: CollectionSlots; writeError: string | null } {
  const { names } = useProjectNames(account.user.id);
  const writes = useTaskWrites(account.user.id);
  const { layout } = useDisplay();
  const selection = useBulkSelection(account.user.id, listBuckets(tasks).flatMap(bucket => bucket.items));
  return {
    slots: {
      projectNames: names, actions: writes.actions, selection,
      layout: layout === "board" ? (shown) => <BoardScreen account={account} tasks={shown} />
        : layout === "calendar" ? (shown) => <ProjectCalendar account={account} tasks={shown} /> : undefined,
    },
    writeError: writes.error,
  };
}

export function LabelScreen({ account }: { account: Account }) {
  const { id = "" } = useParams();
  const query = useQuery(metadataReads.label(account.user.id, id));
  const { slots, writeError } = useCollection(account, query.data?.tasks ?? []);
  const data = query.data && { name: query.data.label.name, tasks: query.data.tasks };
  return <TaskCollectionView kind="label" state={{ ...query, data }} onRetry={() => void query.refetch()} writeError={writeError} {...slots} />;
}

export function FilterScreen({ account }: { account: Account }) {
  const { id = "" } = useParams();
  const query = useQuery(metadataReads.filter(account.user.id, id));
  const { slots, writeError } = useCollection(account, query.data?.tasks ?? []);
  const data = query.data && { name: query.data.filter.name, tasks: query.data.tasks };
  return <TaskCollectionView kind="filter" state={{ ...query, data }} onRetry={() => void query.refetch()} writeError={writeError} {...slots} />;
}

/** Legacy /inbox: every owned task without a project (the Today read is the full collection). */
export function InboxScreen({ account }: { account: Account }) {
  const query = useQuery(reads.today(account.user.id));
  const tasks = useMemo(() => query.data?.tasks.filter(task => task.projectId === null), [query.data]);
  const { slots, writeError } = useCollection(account, tasks ?? []);
  return <TaskCollectionView kind="inbox" state={{ ...query, data: tasks && { name: "Inbox", tasks } }} onRetry={() => void query.refetch()} writeError={writeError} {...slots} />;
}
