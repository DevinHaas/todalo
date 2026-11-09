import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Account } from "./session";
import { coach, coachReads, goalReads, goals, ritualReads, seasonReads, seasons } from "./runtime";
import { openRitual, showWeekPlan } from "./ritual-screens";
import { seasonMutations, type GoalStatusDto, type NextSeason, type SeasonGoalDto, type SeasonGoalPatch, type SeasonTier } from "./seasons";
import { draftMutations } from "./coach";
import { openCoachChat } from "./coach-chat-screens";
import { openPlanning, useCoachConnected } from "./planning-screens";
import { PastSeasonView, SeasonsNav, SeasonView, type CapacitySlot } from "./season-views";
import { goalMutations, linkedGoalIds, milestoneTaskIds, setCriteriaPrompt, type GoalLinkKind, type GoalPatch, type MilestoneDto, type NewGoal } from "./goals";
import type { ReorderPosition } from "./bulk";
import { goalOf } from "./schedule";
import type { TaskDto } from "./tasks";
import { CriteriaConfirm, GoalPicker, GoalsNav, GoalView, type GoalSlots, type MilestoneSlots, type RecommendationSlot } from "./goal-views";
import { SettingSwitch } from "./settings-views";

function useGoalMutations(userId: string) {
  const cache = useQueryClient();
  return useMemo(() => goalMutations(goals, cache, userId), [cache, userId]);
}

/**
 * Ticket 17: the Coach's explanation per season goal. Asks only with a
 * connected provider and a measured status (Too early has nothing to explain).
 */
const statusStamp = (statuses: Record<string, GoalStatusDto> | undefined) =>
  statuses ? Object.entries(statuses).map(([id, status]) => `${id}:${status.band}:${status.score}:${status.weeks.join(",")}`).sort().join("|") : "";

function useCoachExplanations(userId: string, statuses: Record<string, GoalStatusDto> | undefined) {
  const provider = useQuery(coachReads.provider(userId));
  const stamp = statusStamp(statuses);
  const measured = Object.values(statuses ?? {}).some(status => status.band !== "too_early");
  return useQuery({ ...coachReads.explanations(userId, stamp), enabled: Boolean(provider.data?.provider) && measured }).data?.explanations;
}

/**
 * Ticket 21: the Coach's recommendation per goal at Adjust or Off track:
 * Update schedule drafts the week (shown on Upcoming beside the Plan), Chat
 * opens the Coach chat with it, dismiss hides it for the season week. Nothing without a provider.
 */
function useCoachRecommendations(userId: string, season: { goals: SeasonGoalDto[]; statuses: Record<string, GoalStatusDto> } | null | undefined) {
  const cache = useQueryClient();
  const provider = useQuery(coachReads.provider(userId));
  const options = coachReads.recommendations(userId, statusStamp(season?.statuses));
  const struggling = Object.values(season?.statuses ?? {}).some(status => status.band === "adjust" || status.band === "off_track");
  const query = useQuery({ ...options, enabled: Boolean(provider.data?.provider) && struggling });
  const drafts = useMemo(() => draftMutations(coach, cache, userId), [cache, userId]);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const schedule = useMutation({
    mutationFn: (goalId: string) => drafts.draftRecommendation(goalId),
    onMutate: (goalId) => setMessages(({ [goalId]: _, ...rest }) => rest),
    onSuccess: (result, goalId) => result.draft ? showWeekPlan(result.draft.period) : setMessages(current => ({ ...current, [goalId]: result.message ?? "The Coach has nothing to change." })),
    meta: { action: () => "draft your schedule" },
  });
  const dismiss = useMutation({
    mutationFn: (goalId: string) => coach.dismissRecommendation(goalId),
    onMutate: (goalId) => cache.setQueryData(options.queryKey, current => current && { recommendations: current.recommendations.filter(item => item.goalId !== goalId) }),
    onError: () => cache.invalidateQueries({ queryKey: options.queryKey }),
    meta: { action: () => "dismiss the recommendation" },
  });
  const titles = new Map(season?.goals.map(goal => [goal.goalId, goal.title]));
  return Object.fromEntries((query.data?.recommendations ?? []).map(({ goalId, text }): [string, RecommendationSlot] => [goalId, {
    text, drafting: schedule.isPending && schedule.variables === goalId, message: messages[goalId] ?? null,
    onSchedule: () => schedule.mutate(goalId),
    onChat: () => openCoachChat(`About ${titles.get(goalId) ?? "this goal"}: you recommended "${text}" How should I change my plan?`),
    onDismiss: () => dismiss.mutate(goalId),
  }]));
}

/**
 * Ticket 25: the Coach's estimate of the primary goals' weekly time against the
 * time the user has. Undefined without a provider (no Coach UI at all).
 */
function useCapacity(userId: string, primaryCount: number): CapacitySlot | undefined {
  const cache = useQueryClient();
  const provider = useQuery(coachReads.provider(userId));
  const options = seasonReads.capacity(userId);
  const query = useQuery({ ...options, enabled: Boolean(provider.data?.provider) && primaryCount > 0 });
  const save = useMutation({
    mutationFn: (minutes: number | null) => seasons.saveCapacity(minutes),
    onSuccess: (data) => cache.setQueryData(options.queryKey, data),
    meta: { action: () => "save your time for primary goals" },
  });
  if (!provider.data?.provider) return undefined;
  return { data: query.data, loading: query.isPending && query.fetchStatus !== "idle", saving: save.isPending, error: save.error?.message ?? null, onSave: save.mutateAsync };
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
  const create = useMutation({ mutationFn: (title: string) => writes.create({ title }), meta: { action: (title: string) => `add the goal "${title}"` }, onSuccess: (goal) => navigate(`/goals/${encodeURIComponent(goal.id)}`) });
  const reorder = useMutation({ mutationFn: ({ id, anchorId, position }: { id: string; anchorId: string; position: ReorderPosition }) => writes.reorder(id, anchorId, position), meta: { action: () => "move the goal" } });
  // Ticket 15: the same current-season read the Seasons section makes, so the dots cost no extra request.
  const current = useQuery({ ...seasonReads.current(userId), enabled: query.data?.hidden === false });
  if (!query.data || query.data.hidden) return null;
  return <GoalsNav goals={query.data.goals} statuses={current.data?.season?.statuses} adding={adding} onAdding={onAdding}
    onCreate={(title) => create.mutateAsync(title)}
    onReorder={(id, anchorId, position) => reorder.mutate({ id, anchorId, position })}
    write={{ pending: create.isPending, error: (create.error ?? reorder.error)?.message ?? null }} />;
}

/** Goals ticket 04: the current season and the past ones, below Goals (hidden with Goals). */
export function SeasonsSidebar({ userId }: { userId: string }) {
  const shown = useGoalsShown(userId);
  const current = useQuery({ ...seasonReads.current(userId), enabled: shown });
  const past = useQuery({ ...seasonReads.past(userId), enabled: shown });
  if (!shown || !current.data) return null;
  return <SeasonsNav current={current.data.season} past={past.data ?? []} />;
}

/** Task IDs that are milestones, for every row's flag; empty while Goals is hidden. */
export function useMilestoneTaskIds(userId: string) {
  const shown = useGoalsShown(userId);
  const links = useQuery({ ...goalReads.links(userId), enabled: shown });
  return useMemo(() => milestoneTaskIds(shown ? links.data : undefined), [shown, links.data]);
}

/** Ticket 14c: the first goal (sidebar order) each task serves, for row circles and cards; null while Goals is hidden. */
export function useTaskGoalOf(userId: string) {
  const list = useQuery(goalReads.list(userId));
  const shown = list.data ? !list.data.hidden : false;
  const links = useQuery({ ...goalReads.links(userId), enabled: shown });
  return useMemo(() => {
    const goalList = shown ? list.data?.goals ?? [] : [];
    const linkData = links.data ?? { projects: [], tasks: [] };
    return (task: TaskDto) => goalList.length ? goalOf(task, goalList, linkData) ?? null : null;
  }, [shown, list.data, links.data]);
}

export function GoalScreen({ account }: { account: Account }) {
  const { id = "" } = useParams();
  const query = useQuery(goalReads.detail(account.user.id, id));
  // The season target lives on the season; the goal page shows it too.
  const current = useQuery(seasonReads.current(account.user.id));
  const inSeason = current.data?.season?.goals.find(goal => goal.goalId === id);
  const explanations = useCoachExplanations(account.user.id, current.data?.season?.statuses);
  const coachConnected = useCoachConnected(account.user.id);
  const writes = useGoalMutations(account.user.id);
  const update = useMutation({ mutationFn: (patch: GoalPatch) => writes.update(id, patch), meta: { action: (patch: GoalPatch) => patch.archived === undefined ? "save the goal" : patch.archived ? "archive the goal" : "restore the goal" } });
  const unlink = useMutation({ mutationFn: ({ kind, targetId }: { kind: GoalLinkKind; targetId: string }) => writes.link(id, kind, targetId, false), meta: { action: ({ kind }: { kind: GoalLinkKind }) => `unlink the ${kind === "projects" ? "project" : "task"} from the goal` } });
  return <GoalView key={id} state={query} season={inSeason ? { tier: inSeason.tier, target: inSeason.target, status: current.data?.season?.statuses[id], explanation: explanations?.[id] } : null} onRetry={() => void query.refetch()}
    onSave={update.mutateAsync} onArchive={(archived) => update.mutate({ archived })}
    onUnlink={(kind, targetId) => unlink.mutate({ kind, targetId })}
    onPlan={coachConnected ? () => openPlanning({ goalId: id, source: "goal" }) : undefined}
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
  const toggle = useMutation({ mutationFn: ({ goalId, linked }: { goalId: string; linked: boolean }) => writes.link(goalId, kind, targetId!, linked), meta: { action: ({ linked }: { linked: boolean }) => linked ? "link the goal" : "unlink the goal" } });
  // Ticket 03: tasks only. Refetched each time the sheet opens, so label or project edits show on reopen.
  const suggestions = useQuery({ ...goalReads.suggestions(userId, targetId ?? ""), enabled: kind === "tasks" && Boolean(targetId) && list.data?.hidden === false });
  // Ticket 25: with a provider, a second read adds the Coach's by meaning. The rules show first and never wait on it.
  const provider = useQuery({ ...coachReads.provider(userId), enabled: kind === "tasks" });
  const coachSuggestions = useQuery({ ...goalReads.coachSuggestions(userId, targetId ?? ""), enabled: kind === "tasks" && Boolean(targetId) && list.data?.hidden === false && Boolean(provider.data?.provider) });
  const dismiss = useMutation({ mutationFn: (goalId: string) => writes.dismiss(targetId!, goalId), meta: { action: () => "dismiss the suggestion" } });
  if (!targetId || !list.data || list.data.hidden || !links.data) return undefined;
  const linked = linkedGoalIds(links.data, kind, targetId);
  const active = list.data.goals;
  // Only while the task has no goal; the server says the same, this just hides the hint at once on accept.
  const merged = coachSuggestions.data ?? suggestions.data;
  const suggested = linked.some(id => active.some(goal => goal.id === id)) ? [] : (merged?.goalIds ?? []).flatMap(id => active.filter(goal => goal.id === id));
  return {
    goals: active, linked, onToggle: (goalId, linked) => toggle.mutate({ goalId, linked }),
    suggested, onDismiss: (goalId) => dismiss.mutate(goalId), byCoach: merged?.coach,
    error: (toggle.error ?? dismiss.error)?.message ?? null,
  };
}

/**
 * Ticket 06: the task sheet's Milestone property. Undefined while Goals is
 * hidden or loading; without a linked goal its switch is off and says why.
 */
export function useMilestoneSlots(userId: string, taskId: string | null | undefined): MilestoneSlots | undefined {
  const list = useQuery(goalReads.list(userId));
  const shown = Boolean(taskId) && list.data?.hidden === false;
  const links = useQuery({ ...goalReads.links(userId), enabled: shown });
  const milestone = useQuery({ ...goalReads.milestone(userId, taskId ?? ""), enabled: shown });
  const writes = useGoalMutations(userId);
  const change = useMutation({ mutationFn: (next: MilestoneDto | null) => writes.setMilestone(taskId!, next), meta: { action: (next: MilestoneDto | null) => next ? "save the milestone" : "remove the milestone" } });
  if (!taskId || !shown || !list.data || !links.data || milestone.data === undefined) return undefined;
  const linked = linkedGoalIds(links.data, "tasks", taskId);
  const goals = list.data.goals.filter(goal => linked.includes(goal.id));
  return { goals, milestone: milestone.data, onChange: (next) => change.mutate(next), error: change.error?.message ?? null };
}

/**
 * Ticket 06: answers confirmingCriteria for every completion path (rendered
 * once in the shell). Concurrent asks share the one dialog and its answer.
 */
export function CriteriaConfirmHost() {
  const [answer, setAnswer] = useState<((confirmed: boolean) => void) | null>(null);
  useEffect(() => {
    let waiting: Promise<boolean> | null = null;
    setCriteriaPrompt(() => waiting ??= new Promise<boolean>(resolve => setAnswer(() => (confirmed: boolean) => { waiting = null; setAnswer(null); resolve(confirmed); })));
    return () => setCriteriaPrompt(async () => false);
  }, []);
  return answer ? <CriteriaConfirm onAnswer={answer} /> : null;
}

/** The project page's Goals button (hidden with Goals). */
export function ProjectGoals({ userId, projectId }: { userId: string; projectId: string }) {
  const slots = useGoalSlots(userId, "projects", projectId);
  return slots ? <GoalPicker slots={slots} variant="button" data={{ "data-project-action": "goals" }} /> : null;
}

/** Settings › General: one switch hides Goals and Seasons together (seasons plan goals, so neither stands alone in the sidebar). */
export function GoalsHiddenSettingScreen({ userId }: { userId: string }) {
  const query = useQuery(goalReads.list(userId));
  const writes = useGoalMutations(userId);
  const update = useMutation({ mutationFn: (hidden: boolean) => writes.setHidden(hidden), meta: { action: (hidden: boolean) => hidden ? "hide Goals" : "show Goals" } });
  if (!query.data) return null;
  return <>
    <SettingSwitch title="Show goals and seasons" hint="Show Goals and Seasons at the top of the sidebar, goal fields on tasks and projects, and milestone flags. Projects and tasks work the same either way." checked={!query.data.hidden}
      disabled={update.isPending} onChange={(shown) => update.mutate(!shown)} />
    {update.error && <p className="error" role="alert">{update.error.message} The setting was not changed.</p>}
  </>;
}

/** Goals tickets 04-05: the current season (or the form that starts one), ending it, and the past seasons. */
export function SeasonScreen({ account }: { account: Account }) {
  const userId = account.user.id;
  const cache = useQueryClient();
  const query = useQuery(seasonReads.current(userId));
  const list = useQuery(goalReads.list(userId));
  const past = useQuery(seasonReads.past(userId));
  const explanations = useCoachExplanations(userId, query.data?.season?.statuses);
  const recommendations = useCoachRecommendations(userId, query.data?.season);
  const capacity = useCapacity(userId, query.data?.season?.goals.filter(goal => goal.tier === "primary").length ?? 0);
  const writes = useMemo(() => seasonMutations(seasons, cache, userId), [cache, userId]);
  const seasonId = query.data?.season?.id ?? "";
  const start = useMutation({ mutationFn: ({ startDate, lengthDays }: { startDate: string; lengthDays: number }) => writes.start(startDate, lengthDays), meta: { action: () => "start the season" } });
  const goalWrites = useGoalMutations(userId);
  // A goal made on the season page joins this season at once.
  const create = useMutation({ mutationFn: async ({ goal, tier, target }: { goal: NewGoal; tier: SeasonTier; target: string }) => {
    const created = await goalWrites.create(goal);
    return writes.addGoal(seasonId, created.id, tier, target);
  }, meta: { action: ({ goal }: { goal: NewGoal }) => `add "${goal.title}" to the season` } });
  const update = useMutation({ mutationFn: ({ goalId, patch }: { goalId: string; patch: SeasonGoalPatch }) => writes.updateGoal(seasonId, goalId, patch), meta: { action: ({ patch }: { patch: SeasonGoalPatch }) => patch.tier ? `move the goal to ${patch.tier}` : "save the target" } });
  const remove = useMutation({ mutationFn: (goalId: string) => writes.removeGoal(seasonId, goalId), meta: { action: () => "remove the goal from the season" } });
  const end = useMutation({ mutationFn: (next: NextSeason | null) => writes.end(seasonId, next), meta: { action: () => "end the season" } });
  const writing = [start, create, update, remove, end];
  const ritualState = useQuery(ritualReads.state(userId)).data;
  const coachConnected = useCoachConnected(userId);
  const review = ritualState?.settings.seasonReview.enabled
    ? { due: ritualState.seasonReview.due, done: ritualState.seasonReview.status !== null, onStart: () => openRitual("seasonReview") } : undefined;
  return <SeasonView key={seasonId} state={query} goals={list.data?.goals ?? []} past={past.data ?? []} explanations={explanations} recommendations={recommendations} capacity={capacity} onRetry={() => void query.refetch()}
    onStart={(startDate, lengthDays) => start.mutateAsync({ startDate, lengthDays })}
    onCreate={(goal, tier, target) => create.mutateAsync({ goal, tier, target })}
    onUpdate={(goalId, patch) => update.mutateAsync({ goalId, patch })}
    onRemove={(goalId) => remove.mutateAsync(goalId)} onEnd={(next) => end.mutateAsync(next)} review={review}
    onPlan={coachConnected ? () => openPlanning({ source: "season" }) : undefined}
    write={{ pending: writing.some(write => write.isPending), error: writing.find(write => write.error)?.error?.message ?? null }} />;
}

/** Goals ticket 05: one past season, read-only. */
export function PastSeasonScreen({ account }: { account: Account }) {
  const { id = "" } = useParams();
  const query = useQuery(seasonReads.past(account.user.id));
  return <PastSeasonView state={query} id={id} onRetry={() => void query.refetch()} />;
}
