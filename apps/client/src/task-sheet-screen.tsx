import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { commentReads, comments as commentTransport } from "./runtime";
import { commentMutations } from "./comments";
import { operationId, type NewTask, type TaskDto } from "./tasks";
import { useTaskWrites } from "./task-writes";
import { useOrganizationMutations } from "./organization-screens";
import type { CommentSlots } from "./task-sheet";
import type { Account } from "./session";
import { useGoalSlots, useMilestoneSlots } from "./goal-screens";
import { inlineError } from "./toasts";
import { useBulkWrites } from "./bulk-screens";
import type { Horizon } from "../../../packages/server/src/task-dto";

/**
 * The task sheet's immediate writes for whichever screen opens it: completion
 * circles, delete, the project picker, the horizon (goals ticket 31), Add sub-task, the comments section and
 * goal links (goals ticket 02) and the milestone (ticket 06).
 * `onRemoved` runs once the delete is sent (the screen closes the sheet).
 */
export function useTaskSheet(account: Account, task: TaskDto | null | undefined, onRemoved: () => void) {
  const userId = account.user.id;
  const cache = useQueryClient();
  const writes = useTaskWrites(userId);
  const organize = useMutation(useOrganizationMutations(userId).organize);
  const metadata = useMutation(useBulkWrites(userId).metadata);
  const mutations = useMemo(() => commentMutations(commentTransport, cache, userId), [cache, userId]);
  const add = useMutation(mutations.add);
  const remove = useMutation(mutations.remove);
  const list = useQuery({ ...commentReads.task(userId, task?.id ?? ""), enabled: Boolean(task) });
  const goals = useGoalSlots(userId, "tasks", task?.id);
  const milestone = useMilestoneSlots(userId, task?.id);
  if (!task) return {};
  const comments: CommentSlots = {
    state: list, onRetry: () => void list.refetch(),
    author: { name: account.user.name, image: account.user.image },
    add: (body) => add.mutateAsync({ taskId: task.id, body, id: operationId() }),
    remove: (comment) => remove.mutate({ taskId: task.id, id: comment.id }),
    error: inlineError(add.error ?? remove.error ?? undefined, ""),
  };
  return {
    onComplete: writes.actions.complete,
    onRemove: () => { writes.remove.mutate(task); onRemoved(); },
    onMove: (projectId: string | null) => organize.mutateAsync({ task, change: { projectId, sectionId: null } }),
    // Goals ticket 31: failures toast (toasts.ts).
    onHorizon: (horizon: Horizon | null) => metadata.mutate({ tasks: [task], change: { horizon } }),
    onAddSubtask: (subtask: NewTask) => writes.create.mutateAsync(subtask),
    comments,
    goals,
    milestone,
  };
}
