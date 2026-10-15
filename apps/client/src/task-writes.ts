import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { tasks } from "./runtime";
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
  return { create, complete, remove, update, actions, error: (complete.error ?? remove.error)?.message ?? null };
}
