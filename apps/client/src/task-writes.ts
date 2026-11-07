import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { metadataReads, tasks } from "./runtime";
import { taskUrl } from "./links";
import { operationId, taskMutations } from "./tasks";
import { nativeFeedback } from "./feedback";
import type { RowActions } from "./views";

/** The signed-in user's task writes (taskMutations) for any screen. */
export function useTaskWrites(userId: string) {
  const cache = useQueryClient();
  const writes = useMemo(() => taskMutations(tasks, cache, userId, nativeFeedback), [cache, userId]);
  const create = useMutation(writes.create);
  const complete = useMutation(writes.complete);
  const remove = useMutation(writes.remove);
  const update = useMutation(writes.update);
  const actions: RowActions = { complete: (task) => complete.mutate({ task, operationId: operationId() }), remove: (task) => remove.mutate(task) };
  // Failures are toasted (toasts.ts); screens show no inline write banner.
  return { create, complete, remove, update, actions };
}

/**
 * The edit dialog's labels and "Task link · Copy link" (legacy TaskEditDialog
 * everywhere it opens). The link resolves before the tap: WebKit only allows
 * clipboard writes inside the gesture.
 */
export function useEditorExtras(userId: string, taskId: string | null) {
  const labels = useQuery({ ...metadataReads.list(userId), enabled: taskId !== null });
  const link = useQuery({ queryKey: ["user", userId, "task-link", taskId], queryFn: () => taskUrl(taskId!), enabled: taskId !== null, staleTime: Infinity, refetchInterval: false });
  return { labels: labels.data?.labels, shareUrl: link.data };
}
