import { useMemo } from "react";
import { useNavigate, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Account } from "./session";
import { goalReads, goals } from "./runtime";
import { goalMutations, type GoalPatch } from "./goals";
import type { ReorderPosition } from "./bulk";
import { GoalsNav, GoalView } from "./goal-views";
import { SettingSwitch } from "./settings-views";

function useGoalMutations(userId: string) {
  const cache = useQueryClient();
  return useMemo(() => goalMutations(goals, cache, userId), [cache, userId]);
}

/** Whether the sidebar shows Goals; hidden (or not loaded yet) shows nothing, so tasks never wait on goals. */
export function useGoalsShown(userId: string) {
  const query = useQuery(goalReads.list(userId));
  return query.data ? !query.data.hidden : false;
}

export function GoalsSidebar({ userId, adding, onAdding }: { userId: string; adding: boolean; onAdding: (adding: boolean) => void }) {
  const navigate = useNavigate();
  const query = useQuery(goalReads.list(userId));
  const writes = useGoalMutations(userId);
  const create = useMutation({ mutationFn: (title: string) => writes.create(title), onSuccess: (goal) => navigate(`/goals/${encodeURIComponent(goal.id)}`) });
  const reorder = useMutation({ mutationFn: ({ id, anchorId, position }: { id: string; anchorId: string; position: ReorderPosition }) => writes.reorder(id, anchorId, position) });
  if (!query.data || query.data.hidden) return null;
  return <GoalsNav goals={query.data.goals} adding={adding} onAdding={onAdding}
    onCreate={(title) => create.mutateAsync(title)}
    onReorder={(id, anchorId, position) => reorder.mutate({ id, anchorId, position })}
    write={{ pending: create.isPending, error: (create.error ?? reorder.error)?.message ?? null }} />;
}

export function GoalScreen({ account }: { account: Account }) {
  const { id = "" } = useParams();
  const query = useQuery(goalReads.detail(account.user.id, id));
  const writes = useGoalMutations(account.user.id);
  const update = useMutation({ mutationFn: (patch: GoalPatch) => writes.update(id, patch) });
  return <GoalView key={id} state={query} onRetry={() => void query.refetch()}
    onSave={update.mutateAsync} onArchive={(archived) => update.mutate({ archived })}
    write={{ pending: update.isPending, error: update.error?.message ?? null }} />;
}

/** Settings › General: hiding Goals only changes the sidebar. */
export function GoalsHiddenSettingScreen({ userId }: { userId: string }) {
  const query = useQuery(goalReads.list(userId));
  const writes = useGoalMutations(userId);
  const update = useMutation({ mutationFn: (hidden: boolean) => writes.setHidden(hidden) });
  if (!query.data) return null;
  return <>
    <SettingSwitch title="Show goals" hint="Show Goals at the top of the sidebar. Projects and tasks work the same either way." checked={!query.data.hidden}
      disabled={update.isPending} onChange={(shown) => update.mutate(!shown)} />
    {update.error && <p className="error" role="alert">{update.error.message} The setting was not changed.</p>}
  </>;
}
