import { useState, type ReactNode } from "react";
import { CircleCheck, Sunrise, X } from "lucide-react";
import { progressRatings, ratingLabels, type ProgressRating, type RatingDto, type RitualSettingsDto, type RitualsDto } from "./rituals";
import { GoalDot } from "./goal-views";
import {
  Button, Field, FieldContent, FieldDescription, FieldLabel, Hint, Input, Label, Progress, RadioGroup, RadioGroupItem, RightSidebar, Select,
  SelectContent, SelectItem, SelectTrigger, SelectValue, SidebarSectionHeader, Switch, Textarea, cn, sidebarItemClassName,
} from "./ui";

// Pure ritual views (goals ticket 11): no runtime imports. Built only from src/ui (docs/agents/ui.md).

const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const longDay = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
/** "Monday, 9 March" for a YYYY-MM-DD calendar day. */
export const dayLabel = (day: string) => longDay.format(Date.parse(`${day}T00:00:00Z`));

/** Settings › Rituals: each ritual is opt-in, with its time. Every change saves at once. */
export function RitualSettingsForm({ settings, disabled, onChange }: { settings: RitualSettingsDto; disabled?: boolean; onChange: (settings: RitualSettingsDto) => void }) {
  const { checkIn, weeklyReview, seasonReview } = settings;
  const time = (label: string, value: string, set: (time: string) => void) =>
    <Input type="time" aria-label={label} className="w-28" required value={value} disabled={disabled} onChange={event => { if (event.target.value) set(event.target.value); }} />;
  const row = (id: string, title: string, hint: string, on: boolean, toggle: (on: boolean) => void, extra?: ReactNode) =>
    <Field orientation="horizontal" className="items-start gap-3 border-b border-border-subtle py-3">
      <Switch id={id} className="mt-0.5" checked={on} disabled={disabled} onCheckedChange={toggle} />
      <FieldContent><FieldLabel htmlFor={id}>{title}</FieldLabel><FieldDescription>{hint}</FieldDescription>
        {on && extra && <div className="mt-2 flex flex-wrap items-center gap-2">{extra}</div>}</FieldContent>
    </Field>;
  return <div className="ui flex flex-col" data-ritual-settings="">
    {row("ritual-check-in", "Check-in", "Daily: rate yesterday's progress on each season goal. Shows on your schedule (and Google Calendar) as a recurring item.", checkIn.enabled,
      enabled => onChange({ ...settings, checkIn: { ...checkIn, enabled } }),
      <>Every day at {time("Check-in time", checkIn.time, value => onChange({ ...settings, checkIn: { ...checkIn, time: value } }))}</>)}
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
    <Hint className="pt-3">Rituals are optional: skip or close one any time, and the rest of the app works the same without them.</Hint>
  </div>;
}

/** The left sidebar's Rituals section: one click starts the Check-in. Hidden while every ritual is off. */
export function RitualsNav({ rituals, onStart }: { rituals: RitualsDto; onStart: () => void }) {
  const { settings, checkIn } = rituals;
  if (!settings.checkIn.enabled) return null;
  return <section className="ui mb-3 flex flex-col" aria-label="Rituals">
    <SidebarSectionHeader title="Rituals" />
    <button type="button" className={cn(sidebarItemClassName, "text-left")} onClick={onStart} data-ritual-start="checkIn">
      {checkIn.status ? <CircleCheck /> : <Sunrise />}<span className="flex-1 truncate">Check-in</span>
      <span className="text-xs text-subtle-foreground">{checkIn.status === "completed" ? "Done" : checkIn.status === "skipped" ? "Skipped" : settings.checkIn.time}</span>
    </button>
  </section>;
}

export interface CheckInGoal { goalId: string; title: string; color: string }

/**
 * The Check-in's step runner in the right sidebar: one step per current-season
 * goal (a progress rating for yesterday, optional context typed or spoken).
 * Skip records a skip; closing keeps nothing and asks nothing (do it later).
 */
export function CheckInPanel({ goals, period, status, pending, voice, onFinish, onSkip, onClose }: {
  goals: CheckInGoal[]; period: string; status: RitualsDto["checkIn"]["status"]; pending: boolean;
  /** The spoken-context control for one goal's context: calls `append` with what was said. */
  voice?: (append: (text: string) => void) => ReactNode;
  onFinish: (ratings: RatingDto[]) => void; onSkip: () => void; onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  const [ratings, setRatings] = useState<Record<string, { rating?: ProgressRating; context: string }>>({});
  const goal = goals[step];
  const current = goal ? ratings[goal.goalId] ?? { context: "" } : null;
  const set = (patch: Partial<{ rating: ProgressRating; context: string }>) => goal && setRatings(all => ({ ...all, [goal.goalId]: { ...(all[goal.goalId] ?? { context: "" }), ...patch } }));
  const last = step >= goals.length - 1;
  const finish = () => onFinish(goals.flatMap(({ goalId }) => {
    const item = ratings[goalId];
    return item?.rating ? [{ goalId, rating: item.rating, context: item.context.trim() || null }] : [];
  }));
  return <RightSidebar className="ui pt-2 pr-4 max-md:fixed max-md:inset-0 max-md:z-20 max-md:w-full max-md:bg-background" aria-label="Check-in" data-ritual-panel="checkIn"
    title="Check-in" actions={<>
      <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={onSkip} data-ritual-action="skip">Skip</Button>
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Close Check-in" onClick={onClose}><X /></Button>
    </>}>
    <Progress aria-label={`Step ${Math.min(step + 1, Math.max(goals.length, 1))} of ${Math.max(goals.length, 1)}`} value={goals.length ? Math.round((step + 1) / goals.length * 100) : 100} />
    <Hint>How much did {dayLabel(period)} move you towards your goals?{status && <> Today's Check-in is already {status === "completed" ? "done" : "skipped"}; finishing again replaces it.</>}</Hint>
    {!goal ? <>
      <Hint>No goals in the current season to rate. Add goals on the Season page; you can still finish today's Check-in.</Hint>
      <Button type="button" disabled={pending} onClick={finish}>Finish</Button>
    </> : <div className="flex flex-col gap-3" key={goal.goalId}>
      <h3 className="flex items-center gap-2 text-sm font-semibold"><GoalDot color={goal.color} />{goal.title}</h3>
      <RadioGroup aria-label={`Progress on ${goal.title}`} value={current?.rating ?? ""} onValueChange={(value) => set({ rating: value as ProgressRating })} className="gap-2">
        {progressRatings.map(rating => <Label key={rating} className="flex cursor-pointer items-center gap-2 font-normal"><RadioGroupItem value={rating} />{ratingLabels[rating]}</Label>)}
      </RadioGroup>
      <Field>
        <FieldLabel htmlFor="check-in-context">Context <span className="font-normal text-muted-foreground">optional</span></FieldLabel>
        <Textarea id="check-in-context" rows={3} maxLength={5_000} value={current?.context ?? ""} placeholder="What happened? Type or speak."
          onChange={event => set({ context: event.target.value })} />
        {voice?.(text => setRatings(all => {
          const before = all[goal.goalId] ?? { context: "" };
          return { ...all, [goal.goalId]: { ...before, context: [before.context.trim(), text].filter(Boolean).join(" ") } };
        }))}
      </Field>
      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="outline" size="sm" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</Button>
        {last ? <Button type="button" size="sm" disabled={pending} onClick={finish} data-ritual-action="next">{pending ? "Saving…" : "Finish"}</Button>
          : <Button type="button" size="sm" onClick={() => setStep(step + 1)} data-ritual-action="next">{current?.rating ? "Next" : "Skip goal"}</Button>}
      </div>
    </div>}
  </RightSidebar>;
}
