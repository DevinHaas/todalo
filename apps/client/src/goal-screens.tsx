import { useMemo } from "react";
import { useNavigate, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Account } from "./session";
import { goalReads, goals, seasonReads, seasons } from "./runtime";
import { seasonMutations, type SeasonGoalPatch, type SeasonTier } from "./seasons";
import { SeasonView } from "./season-views";
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
  // Ticket 03: tasks only. Refetched each time the sheet opens, so label or project edits show on reopen.
  const suggestions = useQuery({ ...goalReads.suggestions(userId, targetId ?? ""), enabled: kind === "tasks" && Boolean(targetId) && list.data?.hidden === false });
  const dismiss = useMutation({ mutationFn: (goalId: string) => writes.dismiss(targetId!, goalId) });
  if (!targetId || !list.data || list.data.hidden || !links.data) return undefined;
  const linked = linkedGoalIds(links.data, kind, targetId);
  const active = list.data.goals;
  // Only while the task has no goal; the server says the same, this just hides the hint at once on accept.
  const suggested = linked.some(id => active.some(goal => goal.id === id)) ? [] : (suggestions.data?.goalIds ?? []).flatMap(id => active.filter(goal => goal.id === id));
  return {
    goals: active, linked, onToggle: (goalId, linked) => toggle.mutate({ goalId, linked }),
    suggested, onDismiss: (goalId) => dismiss.mutate(goalId),
    error: (toggle.error ?? dismiss.error)?.message ?? null,
  };
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

/** Goals ticket 04: the current season, or the form that starts one. */
export function SeasonScreen({ account }: { account: Account }) {
  const userId = account.user.id;
  const cache = useQueryClient();
  const query = useQuery(seasonReads.current(userId));
  const list = useQuery(goalReads.list(userId));
  const writes = useMemo(() => seasonMutations(seasons, cache, userId), [cache, userId]);
  const seasonId = query.data?.season?.id ?? "";
  const start = useMutation({ mutationFn: ({ startDate, lengthDays }: { startDate: string; lengthDays: number }) => writes.start(startDate, lengthDays) });
  const add = useMutation({ mutationFn: ({ goalId, tier, target }: { goalId: string; tier: SeasonTier; target: string }) => writes.addGoal(seasonId, goalId, tier, target) });
  const update = useMutation({ mutationFn: ({ goalId, patch }: { goalId: string; patch: SeasonGoalPatch }) => writes.updateGoal(seasonId, goalId, patch) });
  return <SeasonView state={query} goals={list.data?.goals ?? []} onRetry={() => void query.refetch()}
    onStart={(startDate, lengthDays) => start.mutateAsync({ startDate, lengthDays })}
    onAdd={(goalId, tier, target) => add.mutateAsync({ goalId, tier, target })}
    onUpdate={(goalId, patch) => update.mutateAsync({ goalId, patch })}
    write={{ pending: start.isPending || add.isPending || update.isPending, error: (start.error ?? add.error ?? update.error)?.message ?? null }} />;
}
