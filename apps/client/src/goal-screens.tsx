import { useMemo } from "react";
import { useNavigate, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Account } from "./session";
import { goalReads, goals } from "./runtime";
import { goalMutations, linkedGoalIds, type GoalLinkKind, type GoalPatch } from "./goals";
import type { ReorderPosition } from "./bulk";
import { GoalPicker, GoalsNav, GoalView, type GoalSlots } from "./goal-views";
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
  const unlink = useMutation({ mutationFn: ({ kind, targetId }: { kind: GoalLinkKind; targetId: string }) => writes.link(id, kind, targetId, false) });
  return <GoalView key={id} state={query} onRetry={() => void query.refetch()}
    onSave={update.mutateAsync} onArchive={(archived) => update.mutate({ archived })}
    onUnlink={(kind, targetId) => unlink.mutate({ kind, targetId })}
    write={{ pending: update.isPending || unlink.isPending, error: (update.error ?? unlink.error)?.message ?? null }} />;
}

/**
 * The goal picker's data for one project or task: undefined while goals load,
 * while Goals is hidden in Settings, or without a target.
 */
export function useGoalSlots(userId: string, kind: GoalLinkKind, targetId: string | null | undefined): GoalSlots | undefined {
  const list = useQuery(goalReads.list(userId));
  const links = useQuery({ ...goalReads.links(userId), enabled: Boolean(targetId) && list.data?.hidden === false });
  const writes = useGoalMutations(userId);
  const toggle = useMutation({ mutationFn: ({ goalId, linked }: { goalId: string; linked: boolean }) => writes.link(goalId, kind, targetId!, linked) });
  if (!targetId || !list.data || list.data.hidden || !links.data) return undefined;
  return { goals: list.data.goals, linked: linkedGoalIds(links.data, kind, targetId), onToggle: (goalId, linked) => toggle.mutate({ goalId, linked }), error: toggle.error?.message ?? null };
}

/** The project page's Goals button (hidden with Goals). */
export function ProjectGoals({ userId, projectId }: { userId: string; projectId: string }) {
  const slots = useGoalSlots(userId, "projects", projectId);
  return slots ? <GoalPicker slots={slots} variant="button" data={{ "data-project-action": "goals" }} /> : null;
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
