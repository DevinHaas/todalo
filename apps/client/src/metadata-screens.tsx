import { useCallback, useMemo, useState } from "react";
import { useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Account } from "./session";
import { metadata, metadataReads, organizationReads, projectReads, reads } from "./runtime";
import { metadataMutations } from "./metadata";
import { evaluateFilter, parseFilterQuery } from "../../../packages/server/src/filter-query";
import { FavoritesNav, listBuckets, MetadataDirectory, TaskCollectionView, type CollectionSlots, type FilterPreview, type MetadataActions } from "./metadata-views";
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

/** /filters and /labels: the Filters & Labels page. */
export function MetadataScreen({ account }: { account: Account }) {
  const userId = account.user.id;
  const cache = useQueryClient();
  const query = useQuery(metadataReads.list(userId));
  const { projects } = useProjectNames(userId);
  // The dialog's preview runs the query here, over the cached tasks, in the viewer's zone.
  const all = useQuery(reads.today(userId)).data?.tasks;
  const sections = useQuery(organizationReads.destinations(userId)).data?.sections;
  const labels = query.data?.labels;
  const preview = useCallback<FilterPreview>((text) => {
    const parsed = parseFilterQuery(text);
    if (!parsed.ok) return { error: parsed.error };
    return { groups: evaluateFilter(parsed.groups, all ?? [], { now: new Date(), labels: labels ?? [], projects, sections: sections ?? [] }) };
  }, [all, labels, projects, sections]);
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
    assistFilter: (description) => metadata.assistFilter(description),
  };
  return <MetadataDirectory state={query} onRetry={() => void query.refetch()} projects={projects} actions={actions} write={{ pending, error }} preview={preview} />;
}

/** The sidebar's Favorites section (favorite projects, filters and labels). */
export function FavoritesSidebar({ userId }: { userId: string }) {
  return <FavoritesNav metadata={useQuery(metadataReads.list(userId)).data} projects={useQuery(projectReads.list(userId)).data} />;
}

/**
 * What a legacy ViewSwitcher gave every task collection (labels, filters,
 * Inbox, search): row writes, selection on the list and the Display layout.
 */
export function useCollection(account: Account, tasks: TaskDto[]): { slots: CollectionSlots } {
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
  };
}

export function LabelScreen({ account }: { account: Account }) {
  const { id = "" } = useParams();
  const query = useQuery(metadataReads.label(account.user.id, id));
  const { slots } = useCollection(account, query.data?.tasks ?? []);
  const data = query.data && { name: query.data.label.name, tasks: query.data.tasks };
  return <TaskCollectionView kind="label" state={{ ...query, data }} onRetry={() => void query.refetch()} {...slots} />;
}

export function FilterScreen({ account }: { account: Account }) {
  const { id = "" } = useParams();
  const query = useQuery(metadataReads.filter(account.user.id, id));
  const { slots } = useCollection(account, query.data?.tasks ?? []);
  const data = query.data && { name: query.data.filter.name, description: query.data.filter.description, tasks: query.data.tasks, groups: query.data.groups };
  return <TaskCollectionView kind="filter" state={{ ...query, data }} onRetry={() => void query.refetch()} {...slots} />;
}

/** Legacy /inbox: every owned task without a project (the Today read is the full collection). */
export function InboxScreen({ account }: { account: Account }) {
  const query = useQuery(reads.today(account.user.id));
  const tasks = useMemo(() => query.data?.tasks.filter(task => task.projectId === null), [query.data]);
  const { slots } = useCollection(account, tasks ?? []);
  return <TaskCollectionView kind="inbox" state={{ ...query, data: tasks && { name: "Inbox", tasks } }} onRetry={() => void query.refetch()} {...slots} />;
}
