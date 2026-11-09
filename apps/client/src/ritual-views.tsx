import { useState, type ReactNode } from "react";
import { CalendarCheck, CalendarRange, CircleCheck, Moon, Sparkles, Sunrise, X } from "lucide-react";
import { progressRatings, ratingLabels, type PlanningAnswer, type ProgressRating, type RatingDto, type RatingHistoryItem, type RitualKind, type RitualSettingsDto, type RitualsDto, type RunStatus, type WeekGoalSummary } from "./rituals";
import { GoalIcon } from "./goal-views";
import {
  Badge, Button, Field, FieldContent, FieldDescription, FieldLabel, Hint, Input, Label, Progress, RadioGroup, RadioGroupItem, RightSidebar, Select,
  SelectContent, SelectItem, SelectTrigger, SelectValue, SidebarSectionHeader, Switch, Textarea, cn, sidebarItemClassName,
} from "./ui";

// Pure ritual views (goals ticket 11): no runtime imports. Built only from src/ui (docs/agents/ui.md).

const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const longDay = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
/** "Monday, 9 March" for a YYYY-MM-DD calendar day. */
export const dayLabel = (day: string) => longDay.format(Date.parse(`${day}T00:00:00Z`));

/** Settings › Rituals: each ritual is opt-in, with its time. Every change saves at once. */
export function RitualSettingsForm({ settings, disabled, onChange }: { settings: RitualSettingsDto; disabled?: boolean; onChange: (settings: RitualSettingsDto) => void }) {
  const { checkIn, eveningReview, weeklyReview, seasonReview } = settings;
  const time = (label: string, value: string, set: (time: string) => void) =>
    <Input type="time" aria-label={label} className="w-28" required value={value} disabled={disabled} onChange={event => { if (event.target.value) set(event.target.value); }} />;
  const row = (id: string, title: string, hint: string, on: boolean, toggle: (on: boolean) => void, extra?: ReactNode) =>
    <Field orientation="horizontal" className="items-start gap-3 border-b border-border-subtle py-3">
      <Switch id={id} className="mt-0.5" checked={on} disabled={disabled} onCheckedChange={toggle} />
      <FieldContent><FieldLabel htmlFor={id}>{title}</FieldLabel><FieldDescription>{hint}</FieldDescription>
        {on && extra && <div className="mt-2 flex flex-wrap items-center gap-2">{extra}</div>}</FieldContent>
    </Field>;
  return <div className="ui flex flex-col" data-ritual-settings="">
    {row("ritual-check-in", "Check-in", "Each morning: plan today. Schedule what matters from your Inbox, overdue and due-today tasks, then adjust today's schedule. Shows on your schedule (and Google Calendar) as a recurring item.", checkIn.enabled,
      enabled => onChange({ ...settings, checkIn: { ...checkIn, enabled } }),
      <>Every day at {time("Check-in time", checkIn.time, value => onChange({ ...settings, checkIn: { ...checkIn, time: value } }))}</>)}
    {row("ritual-evening-review", "Evening review", "Each evening: rate today's progress on each season goal. Shows on your schedule (and Google Calendar) as a recurring item.", eveningReview.enabled,
      enabled => onChange({ ...settings, eveningReview: { ...eveningReview, enabled } }),
      <>Every day at {time("Evening review time", eveningReview.time, value => onChange({ ...settings, eveningReview: { ...eveningReview, time: value } }))}</>)}
    {row("ritual-weekly-review", "Weekly review", "Weekly: check each goal's week and plan the next one.", weeklyReview.enabled,
      enabled => onChange({ ...settings, weeklyReview: { ...weeklyReview, enabled } }),
      <>Every
        <Select items={weekdays.map((label, value) => ({ value: String(value), label }))} value={String(weeklyReview.day)} disabled={disabled}
          onValueChange={(day) => { if (day !== null) onChange({ ...settings, weeklyReview: { ...weeklyReview, day: Number(day) } }); }}>
          <SelectTrigger size="sm" aria-label="Weekly review day" className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>{weekdays.map((label, value) => <SelectItem key={value} value={String(value)}>{label}</SelectItem>)}</SelectContent>
        </Select>
        at {time("Weekly review time", weeklyReview.time, value => onChange({ ...settings, weeklyReview: { ...weeklyReview, time: value } }))}</>)}
    {row("ritual-season-review", "Season review", "When a season ends: look back, choose which goals continue and set next season's targets.", seasonReview.enabled,
      enabled => onChange({ ...settings, seasonReview: { enabled } }))}
    {row("ritual-notify", "Notify me when a ritual is ready", "At a ritual's time, unless it is done or skipped: one notification per ritual and day (or week). Works while todalo is open.", settings.notify,
      notify => onChange({ ...settings, notify }))}
    <Hint className="pt-3">Rituals are optional: skip or close one any time, and the rest of the app works the same without them.</Hint>
  </div>;
}

/** The left sidebar's Rituals section: one click starts a ritual. Hidden while every ritual is off (or only the Season review, without a season). */
export function RitualsNav({ rituals, onStart }: { rituals: RitualsDto; onStart: (kind: RitualKind) => void }) {
  const { settings, checkIn, eveningReview, weeklyReview, seasonReview } = rituals;
  const season = settings.seasonReview.enabled && seasonReview.period !== null;
  if (!settings.checkIn.enabled && !settings.eveningReview.enabled && !settings.weeklyReview.enabled && !season) return null;
  const state = (status: RunStatus | null, otherwise: string) => status === "completed" ? "Done" : status === "skipped" ? "Skipped" : otherwise;
  return <section className="ui mb-3 flex flex-col" aria-label="Rituals">
    <SidebarSectionHeader title="Rituals" />
    {settings.checkIn.enabled && <button type="button" className={cn(sidebarItemClassName, "text-left")} onClick={() => onStart("checkIn")} data-ritual-start="checkIn">
      {checkIn.status ? <CircleCheck /> : <Sunrise />}<span className="flex-1 truncate">Check-in</span>
      <span className="text-xs text-subtle-foreground">{state(checkIn.status, settings.checkIn.time)}</span>
    </button>}
    {settings.eveningReview.enabled && <button type="button" className={cn(sidebarItemClassName, "text-left")} onClick={() => onStart("eveningReview")} data-ritual-start="eveningReview">
      {eveningReview.status ? <CircleCheck /> : <Moon />}<span className="flex-1 truncate">Evening review</span>
      <span className="text-xs text-subtle-foreground">{state(eveningReview.status, settings.eveningReview.time)}</span>
    </button>}
    {settings.weeklyReview.enabled && <button type="button" className={cn(sidebarItemClassName, "text-left")} onClick={() => onStart("weeklyReview")} data-ritual-start="weeklyReview">
      {weeklyReview.status ? <CircleCheck /> : <CalendarRange />}<span className="flex-1 truncate">Weekly review</span>
      <span className="text-xs text-subtle-foreground">{state(weeklyReview.status, weekdays[settings.weeklyReview.day]!.slice(0, 3))}</span>
    </button>}
    {season && <button type="button" className={cn(sidebarItemClassName, "text-left")} onClick={() => onStart("seasonReview")} data-ritual-start="seasonReview">
      {seasonReview.status ? <CircleCheck /> : <CalendarCheck />}<span className="flex-1 truncate">Season review</span>
      <span className="text-xs text-subtle-foreground">{state(seasonReview.status, seasonReview.due ? "Due" : "")}</span>
    </button>}
  </section>;
}

export interface CheckInGoal { goalId: string; title: string; color: string; icon?: string }

/** What differs between the Check-in and the Weekly review panels. */
export interface RitualCopy {
  kind: RitualKind; title: string;
  /** Above each goal's rating. */
  prompt: string;
  /** Shown when the run for this period was already done or skipped. */
  done: string;
  planQuestion: string; planHint: string;
  /** The "help" answer; unused with a custom last step. */
  planYes?: string;
}

/** "1 h 30 min", "45 min", "0 min". */
export const minutesLabel = (minutes: number) => {
  const hours = Math.floor(minutes / 60), rest = Math.round(minutes % 60);
  return hours ? `${hours} h${rest ? ` ${rest} min` : ""}` : `${rest} min`;
};
const shortDay = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" });

/** Ticket 13: one goal's past week above its weekly rating. */
export function WeekSummary({ week }: { week: WeekGoalSummary }) {
  const { checkIns, completed, scheduledMinutes, keptMinutes } = week;
  return <div className="flex flex-col gap-2 rounded-md border border-border-subtle p-3 text-sm" data-week-summary={week.goalId}>
    <div className="flex justify-between gap-2"><span className="text-muted-foreground">Tasks completed</span><span data-week-stat="completed">{completed}</span></div>
    <div className="flex justify-between gap-2"><span className="text-muted-foreground">Time scheduled</span><span data-week-stat="scheduled">{minutesLabel(scheduledMinutes)}</span></div>
    <div className="flex justify-between gap-2"><span className="text-muted-foreground">Time on completed tasks</span><span data-week-stat="kept">{minutesLabel(keptMinutes)}</span></div>
    <div className="flex flex-col gap-1"><span className="text-muted-foreground">Daily ratings</span>
      {checkIns.length ? <div className="flex flex-wrap gap-1">{checkIns.map((item, index) => <Badge key={index} variant="outline">{shortDay.format(Date.parse(`${item.day}T00:00:00Z`))}: {ratingLabels[item.rating]}</Badge>)}</div>
        : <Hint>None this week.</Hint>}
    </div>
  </div>;
}

const shortDate = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const dayMonth = (day: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(Date.parse(`${day}T00:00:00Z`));

/** Ticket 14: one goal's ratings across the season above its season rating, as counts and then each rating, oldest first. */
export function RatingHistory({ goalId, history }: { goalId: string; history: RatingHistoryItem[] }) {
  return <div className="flex flex-col gap-2 rounded-md border border-border-subtle p-3 text-sm" data-rating-history={goalId}>
    <span className="text-muted-foreground">Ratings this season</span>
    {history.length ? <>
      <div className="flex flex-wrap gap-x-3 gap-y-1" data-rating-counts="">{progressRatings.flatMap(rating => {
        const count = history.filter(item => item.rating === rating).length;
        return count ? [<span key={rating}>{ratingLabels[rating]}: <strong className="font-semibold">{count}</strong></span>] : [];
      })}</div>
      <div className="flex max-h-48 flex-wrap gap-1 overflow-y-auto">{history.map(item => <Badge key={`${item.kind}-${item.period}`} variant="outline" title={item.context ?? undefined}>
        {item.kind === "weeklyReview" ? `Week of ${dayMonth(item.period)}` : shortDate.format(Date.parse(`${item.period}T00:00:00Z`))}: {ratingLabels[item.rating]}
      </Badge>)}</div>
    </> : <Hint>No Evening review or Weekly review ratings this season.</Hint>}
  </div>;
}

/**
 * A ritual's step runner in the right sidebar: one step per current-season
 * goal (a progress rating for the period, optional context typed or spoken,
 * and for the Weekly review the goal's week above it), then the planning
 * question (tickets 12 and 13). Either answer finishes the ritual; "help" also
 * opens the schedule to plan. Skip records a skip; closing keeps nothing (do it later).
 */
export function RitualPanel({ copy, goals, status, pending, initial = [], summary, voice, final, notice, onFinish, onCoachPlan, onSkip, onClose }: {
  copy: RitualCopy; goals: CheckInGoal[]; status: RunStatus | null; pending: boolean;
  /** Goals ticket 32: shown on every step under the progress (the Weekly review's "Tidy up" nudge). */
  notice?: ReactNode;
  /** A redo starts from the ratings given before. */
  initial?: RatingDto[];
  /** Shown above a goal's rating (the Weekly review's week). */
  summary?: (goalId: string) => ReactNode;
  /** The spoken-context control for one goal's context: calls `append` with what was said. */
  voice?: (append: (text: string) => void) => ReactNode;
  /** Replaces the planning answers as the last step (the Season review's next season); `back` returns to the last goal. */
  final?: (ratings: RatingDto[], back: ReactNode) => ReactNode;
  onFinish: (ratings: RatingDto[], planning: PlanningAnswer) => void; onSkip: () => void; onClose: () => void;
  /** Ticket 23 (only with a Coach provider): finishes with these ratings and opens a planning session. */
  onCoachPlan?: (ratings: RatingDto[]) => void;
}) {
  const [step, setStep] = useState(0);
  const [ratings, setRatings] = useState<Record<string, { rating?: ProgressRating; context: string }>>(
    () => Object.fromEntries(initial.map(item => [item.goalId, { rating: item.rating, context: item.context ?? "" }])));
  const goal = goals[step];
  const current = goal ? ratings[goal.goalId] ?? { context: "" } : null;
  const set = (patch: Partial<{ rating: ProgressRating; context: string }>) => goal && setRatings(all => ({ ...all, [goal.goalId]: { ...(all[goal.goalId] ?? { context: "" }), ...patch } }));
  // The planning question is the last step, after every goal.
  const steps = goals.length + 1;
  const given = () => goals.flatMap(({ goalId }) => {
    const item = ratings[goalId];
    return item?.rating ? [{ goalId, rating: item.rating, context: item.context.trim() || null }] : [];
  });
  const finish = (planning: PlanningAnswer) => onFinish(given(), planning);
  const back = goals.length > 0 && <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setStep(step - 1)}>Back</Button>;
  const contextId = `${copy.kind}-context`;
  return <RightSidebar className="ui pt-2 pr-4 max-md:fixed max-md:inset-0 max-md:z-20 max-md:w-full max-md:bg-background" aria-label={copy.title} data-ritual-panel={copy.kind}
    title={copy.title} actions={<>
      <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={onSkip} data-ritual-action="skip">Skip</Button>
      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Close ${copy.title}`} onClick={onClose}><X /></Button>
    </>}>
    <Progress aria-label={`Step ${step + 1} of ${steps}`} value={Math.round((step + 1) / steps * 100)} />
    {status && <Hint>{copy.done} {status === "completed" ? "done" : "skipped"}; finishing again replaces it.</Hint>}
    {notice}
    {!goal ? <div className="flex flex-col gap-3" data-ritual-step="planning">
      {!goals.length && <Hint>No goals in the current season to rate. Add goals on the Season page.</Hint>}
      <h3 className="text-sm font-semibold">{copy.planQuestion}</h3>
      <Hint>{copy.planHint}</Hint>
      {final ? final(given(), back) : <><div className="flex flex-col gap-2">
        <Button type="button" disabled={pending} onClick={() => finish("help")} data-ritual-action="plan-help">{copy.planYes}</Button>
        {onCoachPlan && <Button type="button" variant="outline" disabled={pending} onClick={() => onCoachPlan(given())} data-ritual-action="plan-coach"><Sparkles className="text-brand" />Plan a goal with the Coach</Button>}
        <Button type="button" variant="outline" disabled={pending} onClick={() => finish("clear")} data-ritual-action="plan-clear">No, I've got a clear idea</Button>
      </div>
      {back}</>}
    </div> : <div className="flex flex-col gap-3" key={goal.goalId}>
      <h3 className="flex items-center gap-2 text-sm font-semibold"><GoalIcon color={goal.color} icon={goal.icon} />{goal.title}</h3>
      {summary?.(goal.goalId)}
      <Hint>{copy.prompt}</Hint>
      <RadioGroup aria-label={`Progress on ${goal.title}`} value={current?.rating ?? ""} onValueChange={(value) => set({ rating: value as ProgressRating })} className="gap-2">
        {progressRatings.map(rating => <Label key={rating} className="flex cursor-pointer items-center gap-2 font-normal"><RadioGroupItem value={rating} />{ratingLabels[rating]}</Label>)}
      </RadioGroup>
      <Field>
        <FieldLabel htmlFor={contextId}>Context <span className="font-normal text-muted-foreground">optional</span></FieldLabel>
        <Textarea id={contextId} rows={3} maxLength={5_000} value={current?.context ?? ""} placeholder="What happened? Type or speak."
          onChange={event => set({ context: event.target.value })} />
        {voice?.(text => setRatings(all => {
          const before = all[goal.goalId] ?? { context: "" };
          return { ...all, [goal.goalId]: { ...before, context: [before.context.trim(), text].filter(Boolean).join(" ") } };
        }))}
      </Field>
      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="outline" size="sm" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</Button>
        <Button type="button" size="sm" onClick={() => setStep(step + 1)} data-ritual-action="next">{current?.rating ? "Next" : "Skip goal"}</Button>
      </div>
    </div>}
  </RightSidebar>;
}

/** The rituals' wording. Ticket 14b: the Evening review rates today; its last step only finishes. */
export const eveningReviewCopy = (period: string): RitualCopy => ({
  kind: "eveningReview", title: "Evening review", prompt: `How much did today, ${dayLabel(period)}, move you towards this goal?`, done: "Today's Evening review is already",
  planQuestion: "That's every goal", planHint: "Finish to save today's ratings. They show in your Weekly and Season reviews.",
});
export const weeklyReviewCopy = (period: string): RitualCopy => ({
  kind: "weeklyReview", title: "Weekly review", prompt: `How much did the week of ${dayLabel(period)} move you towards this goal?`, done: "This week's review is already",
  planQuestion: "Do you want to plan next week now?", planHint: "Yes opens next week's schedule with the Plan sidebar beside it: drag goal tasks onto a time.", planYes: "Yes, plan next week",
});
/** Ticket 14: the planning fields are the next season (planQuestion/planHint head that step). */
export const seasonReviewCopy = (range: string): RitualCopy => ({
  kind: "seasonReview", title: "Season review", prompt: `Looking back on ${range}, how much did this season move you towards this goal?`, done: "This season's review is already",
  planQuestion: "Which goals continue?", planHint: "Choose the goals that carry into the next season, with their tier and next target. Finishing ends this season (kept as history) and starts the next.",
});
