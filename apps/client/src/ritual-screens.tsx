import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router";
import { Mic, Square } from "lucide-react";
import { coachReads, reads, ritualReads, rituals, seasonReads, seasons } from "./runtime";
import { askCoach } from "./coach-bar";
import { STALE_DAYS, TIDY_PROMPT, staleTasks } from "../../../packages/server/src/task-dto";
import { seasonMutations, type NextSeason } from "./seasons";
import { EndSeasonStep, seasonRange } from "./season-views";
import { addDays, readyRituals, ritualMutations, type PlanningAnswer, type RatingDto, type RitualKind, type RitualRun, type RitualSettingsDto, type RitualsDto } from "./rituals";
import { eveningReviewCopy, RatingHistory, RitualPanel, RitualSettingsForm, RitualsNav, seasonReviewCopy, WeekSummary, weeklyReviewCopy } from "./ritual-views";
import { createRambleRecorder, type RambleView } from "./ramble";
import { platform } from "./ramble-screen";
import { showCalendarDay, useDisplay } from "./schedule-views";
import { parseDayKey } from "./schedule";
import { askNotificationPermission, firstTimeFor, notifyReady } from "./ritual-notify";
import { openPlan } from "./schedule-screens";
import { planRitual } from "./plan-views";
import { LoadFailure, Loading } from "./goal-views";
import { Button, Hint } from "./ui";
import { openPlanning } from "./planning-screens";
import { patternMutations } from "./patterns";
import { reportCoachError } from "./coach-errors";

// Goals ticket 11: ritual settings, the sidebar entry and the step runner in the right sidebar.

const OPEN = "todalo:ritual";
/** Opens a ritual's panel from anywhere (sidebar, schedule item, keyboard). */
export const openRitual = (kind: RitualKind = "checkIn") => window.dispatchEvent(new CustomEvent(OPEN, { detail: kind }));
const SHOW_PLAN = "todalo:show-plan";
/** Ticket 21: the week of `day` on Upcoming as a calendar with the Plan open (where a week draft shows), from any page. */
export const showWeekPlan = (day: string) => window.dispatchEvent(new CustomEvent(SHOW_PLAN, { detail: day }));

const ritualNames: Record<RitualKind, string> = { checkIn: "Check-in", eveningReview: "Evening review", weeklyReview: "Weekly review", seasonReview: "Season review" };

function useRitualWrites(userId: string) {
  const cache = useQueryClient();
  const writes = useMemo(() => ritualMutations(rituals, cache, userId), [cache, userId]);
  const seasonWrites = useMemo(() => seasonMutations(seasons, cache, userId), [cache, userId]);
  return {
    save: useMutation({ mutationFn: writes.save, meta: { action: () => "save your ritual settings" } }),
    record: useMutation({ mutationFn: writes.record, meta: { action: (run: RitualRun) => `${run.status === "skipped" ? "skip" : "save"} the ${ritualNames[run.kind]}` } }),
    // Ticket 14: the existing End season write (carrying goals into the next season), then the review's own ratings.
    review: useMutation({
      mutationFn: async ({ seasonId, period, ratings, next }: { seasonId: string; period: string; ratings: RatingDto[]; next: NextSeason | null }) => {
        await seasonWrites.end(seasonId, next);
        await writes.record({ kind: "seasonReview", period, status: "completed", ratings, planning: null });
      },
      meta: { action: () => "finish the Season review" },
    }),
  };
}

/** The daily ritual items' task IDs: opening one starts its ritual (Check-in, Evening review) instead of the task sheet. */
export function useRitualTaskIds(userId: string): ReadonlyMap<string, RitualKind> {
  const data = useQuery(ritualReads.state(userId)).data;
  return useMemo(() => new Map((["checkIn", "eveningReview"] as const).flatMap(kind =>
    data?.settings[kind].enabled && data[kind].taskId ? [[data[kind].taskId!, kind] as const] : [])), [data]);
}

export function RitualSettingsScreen({ userId }: { userId: string }) {
  const query = useQuery(ritualReads.state(userId));
  const { save } = useRitualWrites(userId);
  if (query.status === "pending") return <div className="ui"><Loading>Loading rituals…</Loading></div>;
  if (!query.data) return <LoadFailure error={query.error} onRetry={() => void query.refetch()} />;
  const before = query.data.settings;
  return <RitualSettingsForm settings={before} onChange={(settings: RitualSettingsDto) => {
    // Ticket 14b: ask for notification permission when a notifying ritual (or notifications) is first turned on.
    const turnedOn = (["checkIn", "eveningReview", "weeklyReview"] as const).some(kind => settings[kind].enabled && !before[kind].enabled) || (settings.notify && !before.notify);
    if (settings.notify && turnedOn) void askNotificationPermission();
    save.mutate(settings);
  }} />;
}

export function RitualsSidebar({ userId }: { userId: string }) {
  const query = useQuery(ritualReads.state(userId));
  return query.data ? <RitualsNav rituals={query.data} onStart={openRitual} /> : null;
}

/**
 * Spoken context through Ramble's capture: each phrase Ramble segments is
 * appended as text when the user stops. Nothing is saved as a task.
 */
export function VoiceContext({ onText }: { onText: (text: string) => void }) {
  const [view, setView] = useState<RambleView | null>(null);
  const recorder = useRef<ReturnType<typeof createRambleRecorder> | null>(null);
  const said = (current: RambleView | null) => (current?.state?.todos ?? []).map(todo => todo.title).join(". ");
  const stop = () => {
    const text = said(recorder.current?.view() ?? null);
    recorder.current?.dispose();
    recorder.current = null;
    setView(null);
    if (text) onText(text);
  };
  useEffect(() => () => recorder.current?.dispose(), []);
  const listening = view !== null && view.status !== "error";
  return <div className="flex flex-wrap items-center gap-2">
    <Button type="button" variant="outline" size="sm" data-ritual-action="voice" aria-pressed={listening}
      onClick={() => {
        if (recorder.current) { stop(); return; }
        recorder.current = createRambleRecorder(platform({ defaultDueDate: null, smartRecognition: false }), setView);
        recorder.current.open();
      }}>
      {recorder.current ? <><Square />Stop</> : <><Mic />Speak</>}
    </Button>
    {view && <Hint aria-live="polite" className="min-w-0 flex-1 truncate">{view.error ?? (said(view) || (view.status === "listening" ? "Listening…" : "Starting microphone…"))}</Hint>}
  </div>;
}

const readyTitles = { checkIn: "Your Check-in is ready", eveningReview: "Your Evening review is ready", weeklyReview: "Your Weekly review is ready" } as const;
const readyBodies = { checkIn: "Plan today: pick what to schedule.", eveningReview: "Rate today's progress on your goals.", weeklyReview: "Look back on the week and plan the next." } as const;
const pad = (value: number) => String(value).padStart(2, "0");

/**
 * Ticket 14b: while the app runs, checks every 30 seconds whether a ritual's
 * time has come (readyRituals) and notifies once per ritual and period.
 * ponytail: client-side only; server push when the app is closed comes with ticket 27.
 */
function useRitualNotifications(userId: string, data: RitualsDto | undefined, refetch: () => Promise<{ data?: RitualsDto }>) {
  const latest = useRef({ data, refetch });
  latest.current = { data, refetch };
  useEffect(() => {
    const due = (state: RitualsDto | undefined) => {
      const now = new Date();
      return state ? readyRituals(state, `${pad(now.getHours())}:${pad(now.getMinutes())}`, now.getDay()) : [];
    };
    const tick = async () => {
      if (!due(latest.current.data).length) return;
      // The cached state may be hours old: confirm against a fresh read before notifying.
      for (const { kind, period } of due((await latest.current.refetch()).data)) {
        if (firstTimeFor(userId, kind, period)) void notifyReady(readyTitles[kind], readyBodies[kind], () => openRitual(kind));
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), 30_000);
    return () => clearInterval(timer);
  }, [userId]);
}

/**
 * Ticket 14c: the Check-in plans today in the Plan sidebar beside Today's
 * calendar (no separate cards; rules in planGroups). This only opens Today and
 * hands the sidebar its header, Skip and Done while it runs.
 */
function CheckInRitual({ userId, state, onShowToday, onClose }: { userId: string; state: RitualsDto; onShowToday: () => void; onClose: () => void }) {
  const { record } = useRitualWrites(userId);
  const { period, status } = state.checkIn;
  const done = (run: Omit<RitualRun, "kind" | "period">) => { record.mutate({ kind: "checkIn", period, ...run }); onClose(); };
  useEffect(() => { onShowToday(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    planRitual.set({ status, pending: record.isPending, onDone: () => done({ status: "completed", ratings: [] }), onSkip: () => done({ status: "skipped", ratings: [] }), onClose });
  });
  useEffect(() => () => planRitual.set(null), []);
  return null;
}

/** The right-sidebar ritual panel, beside every screen; never blocks the rest of the app. */
export function RitualHost({ userId }: { userId: string }) {
  const [open, setOpen] = useState<RitualKind | null>(null);
  const query = useQuery(ritualReads.state(userId));
  const season = useQuery({ ...seasonReads.current(userId), enabled: open !== null });
  const weekly = useQuery({ ...ritualReads.weekly(userId), enabled: open === "weeklyReview" });
  const looking = useQuery({ ...ritualReads.seasonReview(userId), enabled: open === "seasonReview" });
  // Goals ticket 32: the Weekly review's nudge counts the stale tasks.
  const tasks = useQuery({ ...reads.today(userId), enabled: open === "weeklyReview" });
  const { record, review } = useRitualWrites(userId);
  const connected = Boolean(useQuery(coachReads.provider(userId)).data?.provider);
  const cache = useQueryClient();
  useRitualNotifications(userId, query.data, query.refetch);
  // Ending refetches the season before the review closes: keep showing the season under review meanwhile.
  const reviewed = useRef<typeof season.data>(undefined);
  if (!review.isPending) reviewed.current = season.data;
  const shown = review.isPending ? reviewed.current : season.data;
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const display = useDisplay();
  // "help" plans by hand: Today (ticket 12) or next week on Upcoming (ticket 13) as a
  // calendar with the Plan sidebar open. ponytail: no AI involved; tickets 19
  // and 20 add the Coach's drafts on these same schedules.
  const [plan, setPlan] = useState<{ path: "/today" | "/upcoming"; day?: string } | null>(null);
  useEffect(() => {
    if (!plan || pathname !== plan.path) return;
    if (display.layout !== "calendar") display.set({ layout: "calendar" });
    if (plan.day) { if (display.calendarRange !== "week") display.set({ calendarRange: "week" }); showCalendarDay(parseDayKey(plan.day)); }
    openPlan();
    setPlan(null);
  }, [plan, pathname, display]);
  useEffect(() => {
    const start = (event: Event) => setOpen((event as CustomEvent<RitualKind>).detail);
    const show = (event: Event) => { navigate("/upcoming"); setPlan({ path: "/upcoming", day: (event as CustomEvent<string>).detail }); };
    window.addEventListener(OPEN, start);
    window.addEventListener(SHOW_PLAN, show);
    return () => { window.removeEventListener(OPEN, start); window.removeEventListener(SHOW_PLAN, show); };
  }, [navigate]);
  if (!open || !query.data || season.status === "pending") return null;
  const goals = (shown?.season?.goals ?? []).filter(goal => !goal.archived).map(({ goalId, title, color, icon }) => ({ goalId, title, color, icon }));
  const voice = (append: (text: string) => void) => <VoiceContext onText={append} />;
  const close = () => setOpen(null);
  // Ticket 14c: the Check-in runs in Today's Plan sidebar, beside the calendar.
  if (open === "checkIn") return <CheckInRitual userId={userId} state={query.data} onShowToday={() => { navigate("/today"); setPlan({ path: "/today" }); }} onClose={close} />;
  if (open === "eveningReview") {
    const { period, status } = query.data.eveningReview;
    const done = (run: Omit<RitualRun, "kind" | "period">) => { record.mutate({ kind: "eveningReview", period, ...run }); close(); };
    return <RitualPanel key={period} copy={eveningReviewCopy(period)} goals={goals} status={status} pending={record.isPending} voice={voice}
      final={(ratings, back) => <div className="flex items-center justify-between gap-2">{back || <span />}
        <Button type="button" size="sm" disabled={record.isPending} onClick={() => done({ status: "completed", ratings })} data-ritual-action="done">Finish</Button></div>}
      onFinish={() => undefined} onSkip={() => done({ status: "skipped", ratings: [] })} onClose={close} />;
  }
  if (open === "seasonReview") {
    const current = shown?.season;
    if (!current || looking.status === "pending") return null;
    const period = current.startDate;
    const status = query.data.seasonReview.period === period ? query.data.seasonReview.status : null;
    return <RitualPanel key={period} copy={seasonReviewCopy(seasonRange(current))} goals={goals} status={status} pending={record.isPending || review.isPending}
      initial={looking.data?.ratings} voice={voice}
      summary={goalId => {
        if (!looking.data) return <LoadFailure error={looking.error} onRetry={() => void looking.refetch()} />;
        return <RatingHistory goalId={goalId} history={looking.data.goals.find(item => item.goalId === goalId)?.history ?? []} />;
      }}
      final={(ratings, back) => <EndSeasonStep season={current} back={back} write={{ pending: review.isPending, error: review.error?.message ?? null }}
        onEnd={async next => { await review.mutateAsync({ seasonId: current.id, period, ratings, next }); close(); navigate("/season"); }} />}
      onFinish={() => undefined} onSkip={() => { record.mutate({ kind: "seasonReview", period, status: "skipped", ratings: [] }); close(); }} onClose={close} />;
  }
  if (weekly.status === "pending") return null;
  // The week summary failing to load never blocks rating the week.
  const { period, status } = query.data.weeklyReview;
  const nextWeek = weekly.data?.nextWeek ?? addDays(period, 7);
  const done = (run: Omit<RitualRun, "kind" | "period">) => {
    const recorded = record.mutateAsync({ kind: "weeklyReview", period, ...run });
    close();
    // Goals ticket 24: a finished Weekly review is when the Coach learns patterns (one model call; Settings › Coach shows them).
    if (connected && run.status === "completed") void recorded.then(() => patternMutations(cache, userId).learn()).then(result => { reportCoachError(result.error, { background: true }); }).catch(() => undefined);
  };
  // Ticket 32: "12 tasks untouched for 30+ days. Tidy up with the Coach?" (with a provider, and only when there are some).
  const stale = connected && tasks.data ? staleTasks(tasks.data.tasks, new Date()).length : 0;
  const notice = stale > 0 && <div className="flex items-center gap-2 rounded-md border border-border p-2 text-sm" data-weekly-tidy="">
    <span className="flex-1">{stale === 1 ? "1 task" : `${stale} tasks`} untouched for {STALE_DAYS}+ days. Tidy up with the Coach?</span>
    <Button type="button" variant="outline" size="sm" onClick={() => askCoach(TIDY_PROMPT)} data-ritual-action="tidy-up">Tidy up</Button>
  </div>;
  return <RitualPanel key={period} copy={weeklyReviewCopy(period)} goals={goals} status={status} pending={record.isPending} initial={weekly.data?.ratings} voice={voice} notice={notice}
    summary={goalId => {
      if (!weekly.data) return <LoadFailure error={weekly.error} onRetry={() => void weekly.refetch()} />;
      const week = weekly.data.goals.find(item => item.goalId === goalId);
      return week && <WeekSummary week={week} />;
    }}
    onFinish={(ratings: RatingDto[], planning: PlanningAnswer) => {
      done({ status: "completed", ratings, planning });
      if (planning === "help") { navigate("/upcoming"); setPlan({ path: "/upcoming", day: nextWeek }); }
    }}
    // Ticket 23: finish the review, then plan a goal with the Coach (only with a provider).
    onCoachPlan={connected ? (ratings) => { done({ status: "completed", ratings, planning: "help" }); openPlanning({ source: "review" }); } : undefined}
    onSkip={() => done({ status: "skipped", ratings: [] })} onClose={close} />;
}
