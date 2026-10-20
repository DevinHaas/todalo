import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { bulk, metadataReads, organizationReads } from "./runtime";
import { bulkMutations, completion, type ReorderInput, type ReorderPosition } from "./bulk";
import { SelectionControl, SelectionToolbar, useSelection, type BulkActions } from "./bulk-views";
import { nativeFeedback } from "./feedback";
import type { TaskDto } from "./tasks";
import type { SelectionSlots } from "./views";

export function useBulkWrites(userId: string) {
  const cache = useQueryClient();
  return useMemo(() => bulkMutations(bulk, cache, userId, nativeFeedback), [cache, userId]);
}

/**
 * Selection and bulk actions for a task collection screen. `tasks` are the
 * rows the screen shows (selected IDs that leave it drop out).
 */
export function useBulkSelection(userId: string, tasks: TaskDto[]): SelectionSlots {
  const selection = useSelection(tasks.map(task => task.id));
  const writes = useBulkWrites(userId);
  const complete = useMutation(writes.complete);
  const remove = useMutation(writes.remove);
  const clearDates = useMutation(writes.clearDates);
  const metadata = useMutation(writes.metadata);
  const move = useMutation(writes.move);
  // Picker data loads with the selection, not with every list.
  const labels = useQuery({ ...metadataReads.list(userId), enabled: selection.active });
  const destinations = useQuery({ ...organizationReads.destinations(userId), enabled: selection.active });
  const actions: BulkActions = {
    complete: (selected) => complete.mutateAsync(completion(selected)),
    remove: (selected) => remove.mutateAsync({ tasks: selected }),
    clearDates: (selected) => clearDates.mutateAsync({ tasks: selected }),
    metadata: (selected, change) => metadata.mutateAsync({ tasks: selected, change }),
    move: (selected, destination) => move.mutateAsync({ tasks: selected, destination }),
    labels: labels.data?.labels,
    destinations, onRetryDestinations: () => void destinations.refetch(),
  };
  return {
    control: <SelectionControl selection={selection} />,
    toolbar: <SelectionToolbar selection={selection} tasks={tasks} actions={actions} />,
    row: (task) => selection.active ? { selected: selection.has(task.id), toggle: () => selection.toggle(task.id) } : undefined,
  };
}

/** Manual reorder (drag or keyboard) of one task next to another in its project, or into a board column (`move`). */
export function useReorder(userId: string) {
  const reorder = useMutation(useBulkWrites(userId).reorder);
  return {
    reorder: (task: TaskDto, anchorId: string, position: ReorderPosition) => reorder.mutate({ task, anchorId, position }),
    move: (task: TaskDto, move: ReorderInput) => reorder.mutate({ task, ...move }),
    error: reorder.error?.message ?? null,
  };
}
