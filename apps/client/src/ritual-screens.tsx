import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router";
import { Mic, Square } from "lucide-react";
import { ritualReads, rituals, seasonReads, seasons } from "./runtime";
import { seasonMutations, type NextSeason } from "./seasons";
import { EndSeasonStep, seasonRange } from "./season-views";
import { addDays, ritualMutations, type PlanningAnswer, type RatingDto, type RitualKind, type RitualRun, type RitualSettingsDto } from "./rituals";
import { checkInCopy, RatingHistory, RitualPanel, RitualSettingsForm, RitualsNav, seasonReviewCopy, WeekSummary, weeklyReviewCopy } from "./ritual-views";
import { createRambleRecorder, type RambleView } from "./ramble";
import { platform } from "./ramble-screen";
import { showCalendarDay, useDisplay } from "./schedule-views";
import { parseDayKey } from "./schedule";
import { openUnscheduled } from "./schedule-screens";
import { LoadFailure, Loading } from "./goal-views";
import { Button, Hint } from "./ui";

// Goals ticket 11: ritual settings, the sidebar entry and the step runner in the right sidebar.

const OPEN = "todalo:ritual";
/** Opens a ritual's panel from anywhere (sidebar, schedule item, keyboard). */
export const openRitual = (kind: RitualKind = "checkIn") => window.dispatchEvent(new CustomEvent(OPEN, { detail: kind }));

const ritualNames: Record<RitualKind, string> = { checkIn: "Check-in", weeklyReview: "Weekly review", seasonReview: "Season review" };

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

/** The Check-in item's task ID: opening that task starts the Check-in instead of the task sheet. */
export function useCheckInTaskId(userId: string) {
  const query = useQuery(ritualReads.state(userId));
  return query.data?.settings.checkIn.enabled ? query.data.checkIn.taskId : null;
}

export function RitualSettingsScreen({ userId }: { userId: string }) {
  const query = useQuery(ritualReads.state(userId));
  const { save } = useRitualWrites(userId);
  if (query.status === "pending") return <div className="ui"><Loading>Loading rituals…</Loading></div>;
  if (!query.data) return <LoadFailure error={query.error} onRetry={() => void query.refetch()} />;
  return <RitualSettingsForm settings={query.data.settings} onChange={(settings: RitualSettingsDto) => save.mutate(settings)} />;
}

export function RitualsSidebar({ userId }: { userId: string }) {
  const query = useQuery(ritualReads.state(userId));
  return query.data ? <RitualsNav rituals={query.data} onStart={openRitual} /> : null;
}

/**
 * Spoken context through Ramble's capture: each phrase Ramble segments is
 * appended as text when the user stops. Nothing is saved as a task.
 */
function VoiceContext({ onText }: { onText: (text: string) => void }) {
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

/** The right-sidebar ritual panel, beside every screen; never blocks the rest of the app. */
export function RitualHost({ userId }: { userId: string }) {
  const [open, setOpen] = useState<RitualKind | null>(null);
  const query = useQuery(ritualReads.state(userId));
  const season = useQuery({ ...seasonReads.current(userId), enabled: open !== null });
  const weekly = useQuery({ ...ritualReads.weekly(userId), enabled: open === "weeklyReview" });
  const looking = useQuery({ ...ritualReads.seasonReview(userId), enabled: open === "seasonReview" });
  const { record, review } = useRitualWrites(userId);
  // Ending refetches the season before the review closes: keep showing the season under review meanwhile.
  const reviewed = useRef<typeof season.data>(undefined);
  if (!review.isPending) reviewed.current = season.data;
  const shown = review.isPending ? reviewed.current : season.data;
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const display = useDisplay();
  // "help" plans by hand: Today (ticket 12) or next week on Upcoming (ticket 13) as a
  // calendar with the unscheduled sidebar open. ponytail: no AI involved; tickets 19
  // and 20 add the Coach's drafts on these same schedules.
  const [plan, setPlan] = useState<{ path: "/today" | "/upcoming"; day?: string } | null>(null);
  useEffect(() => {
    if (!plan || pathname !== plan.path) return;
    if (display.layout !== "calendar") display.set({ layout: "calendar" });
    if (plan.day) { if (display.calendarRange !== "week") display.set({ calendarRange: "week" }); showCalendarDay(parseDayKey(plan.day)); }
    openUnscheduled();
    setPlan(null);
  }, [plan, pathname, display]);
  useEffect(() => {
    const start = (event: Event) => setOpen((event as CustomEvent<RitualKind>).detail);
    window.addEventListener(OPEN, start);
    return () => window.removeEventListener(OPEN, start);
  }, []);
  if (!open || !query.data || season.status === "pending") return null;
  const goals = (shown?.season?.goals ?? []).filter(goal => !goal.archived).map(({ goalId, title, color }) => ({ goalId, title, color }));
  const voice = (append: (text: string) => void) => <VoiceContext onText={append} />;
  const close = () => setOpen(null);
  if (open === "checkIn") {
    const { period, status } = query.data.checkIn;
    const done = (run: Omit<RitualRun, "kind" | "period">) => { record.mutate({ kind: "checkIn", period, ...run }); close(); };
    return <RitualPanel key={period} copy={checkInCopy(period)} goals={goals} status={status} pending={record.isPending} voice={voice}
      onFinish={(ratings: RatingDto[], planning: PlanningAnswer) => {
        done({ status: "completed", ratings, planning });
        if (planning === "help") { navigate("/today"); setPlan({ path: "/today" }); }
      }} onSkip={() => done({ status: "skipped", ratings: [] })} onClose={close} />;
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
  const done = (run: Omit<RitualRun, "kind" | "period">) => { record.mutate({ kind: "weeklyReview", period, ...run }); close(); };
  return <RitualPanel key={period} copy={weeklyReviewCopy(period)} goals={goals} status={status} pending={record.isPending} initial={weekly.data?.ratings} voice={voice}
    summary={goalId => {
      if (!weekly.data) return <LoadFailure error={weekly.error} onRetry={() => void weekly.refetch()} />;
      const week = weekly.data.goals.find(item => item.goalId === goalId);
      return week && <WeekSummary week={week} />;
    }}
    onFinish={(ratings: RatingDto[], planning: PlanningAnswer) => {
      done({ status: "completed", ratings, planning });
      if (planning === "help") { navigate("/upcoming"); setPlan({ path: "/upcoming", day: nextWeek }); }
    }} onSkip={() => done({ status: "skipped", ratings: [] })} onClose={close} />;
}
