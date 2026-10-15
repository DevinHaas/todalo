import { useMemo, useState } from "react";
import { useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Account } from "./session";
import { metadata, metadataReads, projectReads } from "./runtime";
import { metadataMutations } from "./metadata";
import { MetadataDirectory, TaskCollectionView, type MetadataActions } from "./metadata-views";
import { useTaskWrites } from "./task-writes";

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

export function LabelScreen({ account }: { account: Account }) {
  const { id = "" } = useParams();
  const query = useQuery(metadataReads.label(account.user.id, id));
  const { names } = useProjectNames(account.user.id);
  const tasks = useTaskWrites(account.user.id);
  const data = query.data && { name: query.data.label.name, tasks: query.data.tasks };
  return <TaskCollectionView kind="label" state={{ ...query, data }} onRetry={() => void query.refetch()} projectNames={names} actions={tasks.actions} writeError={tasks.error} />;
}

export function FilterScreen({ account }: { account: Account }) {
  const { id = "" } = useParams();
  const query = useQuery(metadataReads.filter(account.user.id, id));
  const { names } = useProjectNames(account.user.id);
  const tasks = useTaskWrites(account.user.id);
  const data = query.data && { name: query.data.filter.name, tasks: query.data.tasks };
  return <TaskCollectionView kind="filter" state={{ ...query, data }} onRetry={() => void query.refetch()} projectNames={names} actions={tasks.actions} writeError={tasks.error} />;
}
