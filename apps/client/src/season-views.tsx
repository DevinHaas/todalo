import { useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { Link, NavLink } from "react-router";
import { CalendarRange, History, Pencil, Plus } from "lucide-react";
import { nextGoalColor, type GoalColor, type GoalDto, type NewGoal } from "./goals";
import { ColorPicker, FormError, GoalDot, LoadFailure, Loading, SeasonTarget } from "./goal-views";
import { primaryGuideline, seasonLengths, tooManyPrimary, type CurrentSeasonDto, type NextSeason, type SeasonDto, type SeasonGoalDto, type SeasonGoalPatch, type SeasonTier } from "./seasons";
import type { ReadState } from "./views";
import { releaseFocus } from "./software-keyboard";
import {
  Alert, AlertAction, AlertDescription, Button, Checkbox, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Field,
  FieldLabel, FieldLegend, FieldSet, Hint, Input, Label, List, ListRow, PageHeader, PageSection, Progress, RadioGroup, RadioGroupItem, Select,
  SelectContent, SelectItem, SelectTrigger, SelectValue, SidebarSectionHeader, Switch, Textarea, ToggleGroup, ToggleGroupItem, cn, sidebarItemClassName,
} from "./ui";

// Pure season views (goals tickets 04-05): no runtime imports. Built only from src/ui (docs/agents/ui.md).
type Write = { pending: boolean; error: string | null };
type Season = NonNullable<CurrentSeasonDto["season"]>;

/** Today as the date input's value, in the device's own zone. */
const localToday = () => { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10); };
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
/** A calendar date plus whole days, without timezone drift. */
const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const dayMonth = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const fullDay = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const at = (date: string) => Date.parse(`${date}T00:00:00Z`);
/** "5 Jan – 29 Mar 2026" (the last day is start + length - 1); the start's year shows when it differs. */
export const seasonRange = (season: Pick<SeasonDto, "startDate" | "lengthDays">) => {
  const end = addDays(season.startDate, season.lengthDays - 1);
  return `${(end.slice(0, 4) === season.startDate.slice(0, 4) ? dayMonth : fullDay).format(at(season.startDate))} – ${fullDay.format(at(end))}`;
};
/** The sidebar's short form: "Day 52 of 84", "Starts in 3 days", "Over". */
export const seasonShortLabel = ({ phase, day, length, startsIn }: Season["progress"]) =>
  phase === "upcoming" ? `Starts in ${plural(startsIn, "day")}` : phase === "over" ? "Over" : `Day ${day} of ${length}`;

const goalPath = (goalId: string) => `/goals/${encodeURIComponent(goalId)}`;

/** The sidebar's Seasons section, separate from Goals: the current season (or a way to start one) and the latest past ones. */
export function SeasonsNav({ current, past }: { current: Season | null; past: SeasonDto[] }) {
  return <section className="ui mb-3 flex flex-col" aria-label="Seasons">
    <SidebarSectionHeader title="Seasons" />
    {current ? <NavLink to="/season" end className={sidebarItemClassName}><CalendarRange /><span className="flex-1 truncate">Current season</span><span className="text-xs text-subtle-foreground">{seasonShortLabel(current.progress)}</span></NavLink>
      : <NavLink to="/season" end className={cn(sidebarItemClassName, "text-muted-foreground")}><Plus /><span className="truncate">Start a season</span></NavLink>}
    {/* ponytail: the latest three; the season page lists them all. */}
    {past.slice(0, 3).map(season => <NavLink key={season.id} to={`/season/${encodeURIComponent(season.id)}`} className={cn(sidebarItemClassName, "text-muted-foreground")}><History /><span className="truncate">{seasonRange(season)}</span></NavLink>)}
  </section>;
}

/** Primary/Secondary as a two-button switch; `data-season-goal-action="tier"` is the other tier (Shift+P). */
function TierToggle({ value, onChange, disabled, action }: { value: SeasonTier; onChange(tier: SeasonTier): void; disabled?: boolean; action?: boolean }) {
  return <ToggleGroup aria-label="Tier" variant="outline" size="sm" value={[value]} disabled={disabled}
    onValueChange={(next) => { const tier = next[0] as SeasonTier | undefined; if (tier && tier !== value) onChange(tier); }}>
    {(["primary", "secondary"] as const).map(tier => <ToggleGroupItem key={tier} value={tier} className="px-2.5 text-xs-plus"
      data-season-goal-action={action && value !== tier ? "tier" : undefined}>{tier === "primary" ? "Primary" : "Secondary"}</ToggleGroupItem>)}
  </ToggleGroup>;
}

/** "Day 52 of 84 · 32 days left", or when it starts / that its last day passed. */
export function seasonDayLabel({ phase, day, length, daysLeft, startsIn }: Season["progress"]) {
  if (phase === "upcoming") return `Starts in ${plural(startsIn, "day")} · ${plural(length, "day")}`;
  if (phase === "over") return `All ${length} days done`;
  return `Day ${day} of ${length} · ${daysLeft ? `${plural(daysLeft, "day")} left` : "last day"}`;
}

export function SeasonView({ state, goals, past, onRetry, onStart, onAdd, onCreate, onUpdate, onRemove, onEnd, review, write }: {
  state: ReadState<CurrentSeasonDto>; goals: GoalDto[]; past: SeasonDto[]; onRetry: () => void;
  onStart: (startDate: string, lengthDays: number) => Promise<unknown>;
  onAdd: (goalId: string, tier: SeasonTier, target: string) => Promise<unknown>;
  /** Creates a goal and adds it to this season. */
  onCreate: (goal: NewGoal, tier: SeasonTier, target: string) => Promise<unknown>;
  onUpdate: (goalId: string, patch: SeasonGoalPatch) => Promise<unknown>;
  onRemove: (goalId: string) => Promise<unknown>;
  onEnd: (next: NextSeason | null) => Promise<unknown>;
  /** Ticket 14: while the Season review is on; `due` from the season's last day. */
  review?: { due: boolean; done: boolean; onStart: () => void };
  write: Write;
}) {
  const [ending, setEnding] = useState(false);
  if (state.status === "pending") return <div className="ui"><Loading>Loading season…</Loading></div>;
  if (state.status === "error") return <div className="ui"><LoadFailure error={state.error} onRetry={onRetry} /></div>;
  const season = state.data?.season;
  if (!season) return <div className="ui max-w-page">
    <PageHeader title="Season" />
    <Hint className="text-sm">A season is the time box your goals are planned against. Start one, then choose which goals it commits to.</Hint>
    <StartSeason onStart={onStart} write={write} />
    <PastSeasons seasons={past} />
  </div>;
  const available = goals.filter(goal => !season.goals.some(item => item.goalId === goal.id));
  const primary = season.goals.filter(goal => goal.tier === "primary");
  const { day, length, phase } = season.progress;
  return <div className="ui max-w-page" data-season-id={season.id}>
    <PageHeader title="Season" actions={<>
      {review && <Button variant="outline" size="sm" data-season-action="review" onClick={review.onStart}>Season review</Button>}
      <Button variant="outline" size="sm" data-season-action="end" onClick={() => setEnding(true)}>End season</Button>
    </>} />
    <p className="text-muted-foreground" data-season-phase={phase}><strong className="font-semibold text-foreground">{seasonDayLabel(season.progress)}</strong> · {seasonRange(season)}</p>
    <Progress aria-hidden="true" className="mt-2 mb-4" value={phase === "upcoming" ? 0 : Math.round(day / length * 100)} />
    {review?.due && !review.done && <div role="status" className="mb-4" data-season-review-due=""><Alert><AlertDescription>
      {phase === "over" ? "This season's last day has passed." : "Today is this season's last day."} Look back on it and choose what continues.
    </AlertDescription><AlertAction><Button size="sm" onClick={review.onStart}>Start Season review</Button></AlertAction></Alert></div>}
    {tooManyPrimary(season.goals) && <div role="status" className="mb-4"><Alert><AlertDescription>
      {primary.length} primary goals. Around {primaryGuideline} keeps your best time protected; consider making some secondary.
    </AlertDescription></Alert></div>}
    {write.error && <FormError>{write.error}</FormError>}
    <TierSections goals={season.goals} row={goal => <SeasonGoalRow key={goal.id} goal={goal} onUpdate={onUpdate} onRemove={onRemove} write={write} />}
      empty={{ primary: "No primary goals yet. These get your best time.", secondary: "No secondary goals. These are the first to drop when time runs short." }} />
    <PageSection title="Not in this season" aria-label="Other goals">
      {available.length ? <List>{available.map(goal => <OtherGoalRow key={goal.id} goal={goal} onAdd={onAdd} write={write} />)}</List>
        : <Hint className="py-2">Every active goal is in this season.</Hint>}
      <NewSeasonGoal count={goals.length} onCreate={onCreate} write={write} />
    </PageSection>
    <PastSeasons seasons={past} />
    <Dialog open={ending} onOpenChange={setEnding}>
      <DialogContent size="xl">{ending && <EndSeason season={season} onEnd={onEnd} onCancel={() => setEnding(false)} write={write} />}</DialogContent>
    </Dialog>
  </div>;
}

function TierSections({ goals, row, empty }: { goals: SeasonGoalDto[]; row: (goal: SeasonGoalDto) => ReactNode; empty: Record<SeasonTier, string> }) {
  return (["primary", "secondary"] as const).map(tier => {
    const items = goals.filter(goal => goal.tier === tier);
    return <PageSection key={tier} title={tier === "primary" ? "Primary" : "Secondary"} aria-label={tier === "primary" ? "Primary goals" : "Secondary goals"}>
      {items.length ? <List>{items.map(row)}</List> : <Hint className="py-2">{empty[tier]}</Hint>}
    </PageSection>;
  });
}

function PastSeasons({ seasons }: { seasons: SeasonDto[] }) {
  if (!seasons.length) return null;
  return <PageSection title="Past seasons" aria-label="Past seasons" className="mt-9">
    <List>{seasons.map(season => <ListRow key={season.id} className="justify-between">
      <Link className="hover:underline hover:underline-offset-4" to={`/season/${encodeURIComponent(season.id)}`}>{seasonRange(season)}</Link>
      <span className="text-xs-plus text-muted-foreground">{plural(season.goals.length, "goal")}</span>
    </ListRow>)}</List>
  </PageSection>;
}

const GoalTitle = ({ goalId, color, title, archived }: { goalId: string; color: string; title: string; archived?: boolean }) =>
  <Link className="inline-flex min-w-0 items-center gap-2 self-start font-medium [overflow-wrap:anywhere] hover:underline hover:underline-offset-4" to={goalPath(goalId)}>
    <GoalDot color={color} />{title}{archived && <span className="font-normal text-muted-foreground"> (archived)</span>}
  </Link>;

/** A past season, read-only: its goals with the tiers and targets they had. */
export function PastSeasonView({ state, id, onRetry }: { state: ReadState<SeasonDto[]>; id: string; onRetry: () => void }) {
  if (state.status === "pending") return <div className="ui"><Loading>Loading season…</Loading></div>;
  if (state.status === "error") return <div className="ui"><LoadFailure error={state.error} onRetry={onRetry} /></div>;
  const season = state.data?.find(item => item.id === id);
  const back = <Button variant="outline" size="sm" nativeButton={false} render={<Link to="/season" />}>Current season</Button>;
  if (!season) return <div className="ui flex max-w-page flex-col items-start gap-3"><PageHeader title="Season" />
    <Hint>This season does not exist or is still running.</Hint>{back}</div>;
  return <div className="ui max-w-page" data-season-id={season.id}>
    <PageHeader title={`Season ${seasonRange(season)}`} actions={back} />
    <p className="text-muted-foreground">{plural(season.lengthDays, "day")}{season.endedAt && ` · ended ${fullDay.format(new Date(season.endedAt))}`}</p>
    <TierSections goals={season.goals} empty={{ primary: "No primary goals.", secondary: "No secondary goals." }} row={goal => <ListRow key={goal.id} data-season-goal={goal.goalId}>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5"><GoalTitle goalId={goal.goalId} color={goal.color} title={goal.title} /><SeasonTarget text={goal.target} /></div>
    </ListRow>} />
  </div>;
}

/** Date and length fields shared by starting a season and starting the next one when ending. */
function useSeasonDates(initialStart: string) {
  const [startDate, setStartDate] = useState(initialStart);
  const [choice, setChoice] = useState<"long" | "short" | "custom">("long");
  const [custom, setCustom] = useState("42");
  const lengthDays = choice === "custom" ? Number(custom) : seasonLengths[choice];
  const valid = Boolean(startDate) && Number.isInteger(lengthDays) && lengthDays >= 1 && lengthDays <= 366;
  const fields = <>
    <Field className="max-w-48"><FieldLabel htmlFor="season-start">Start date</FieldLabel><Input id="season-start" type="date" required value={startDate} onChange={event => setStartDate(event.target.value)} /></Field>
    <FieldSet className="gap-2"><FieldLegend variant="label">Length</FieldLegend>
      <div className="flex min-h-control flex-wrap items-center gap-x-5 gap-y-2">
        <RadioGroup aria-label="Length" value={choice} onValueChange={(value) => setChoice(value as typeof choice)} className="flex w-auto flex-wrap gap-x-5 gap-y-2">
          {([["long", "12 weeks"], ["short", "4 weeks"], ["custom", "Custom"]] as const).map(([value, label]) => <Label key={value} className="flex cursor-pointer items-center gap-2 font-normal"><RadioGroupItem value={value} />{label}</Label>)}
        </RadioGroup>
        {choice === "custom" && <Label className="flex items-center gap-2 font-normal"><Input type="number" aria-label="Days" className="w-20" min={1} max={366} step={1} required value={custom} onChange={event => setCustom(event.target.value)} />days</Label>}
      </div>
    </FieldSet>
  </>;
  return { startDate, lengthDays, valid, fields };
}

/**
 * Which goals continue, each with a fresh tier and target, and the next
 * season's dates: the fields shared by the End season dialog and the Season
 * review's last step (ticket 14). Ending and starting are one server write.
 */
function useEndSeason(season: SeasonDto, onEnd: (next: NextSeason | null) => Promise<unknown>) {
  const dayAfter = addDays(season.startDate, season.lengthDays);
  const dates = useSeasonDates(dayAfter > localToday() ? dayAfter : localToday());
  const [startNext, setStartNext] = useState(true);
  const [carry, setCarry] = useState(() => Object.fromEntries(season.goals.map(goal => [goal.goalId, { on: !goal.archived, tier: goal.tier, target: goal.target }])));
  const set = (goalId: string, patch: Partial<(typeof carry)[string]>) => setCarry(current => ({ ...current, [goalId]: { ...current[goalId]!, ...patch } }));
  const chosen = season.goals.filter(goal => carry[goal.goalId]?.on);
  const valid = !startNext || (dates.valid && chosen.every(goal => carry[goal.goalId]!.target.trim()));
  async function submit(event: FormEvent) {
    event.preventDefault();
    const next = startNext ? { startDate: dates.startDate, lengthDays: dates.lengthDays, goals: chosen.map(goal => ({ goalId: goal.goalId, tier: carry[goal.goalId]!.tier, target: carry[goal.goalId]!.target })) } : null;
    try { await onEnd(next); } catch { /* shown through write.error */ }
  }
  const fields = <>
    <Label className="flex cursor-pointer items-center gap-2 font-normal"><Checkbox checked={startNext} onCheckedChange={setStartNext} />Start the next season now</Label>
    {startNext && <>
      {dates.fields}
      <FieldSet className="gap-0"><FieldLegend variant="label">Goals that continue</FieldLegend>
        {season.goals.length ? season.goals.map(goal => {
          const item = carry[goal.goalId]!;
          return <div key={goal.id} className="flex flex-col gap-2 border-t border-border-subtle py-2.5" data-season-carry={goal.goalId}>
            <Label className="flex cursor-pointer items-center gap-2 font-normal"><Checkbox checked={item.on} disabled={goal.archived} onCheckedChange={(on) => set(goal.goalId, { on })} />
              <GoalDot color={goal.color} />{goal.title}{goal.archived && <span className="text-muted-foreground"> (archived)</span>}</Label>
            {item.on && <div className="flex flex-wrap items-center gap-2 pl-6">
              <Select items={[{ value: "primary", label: "Primary" }, { value: "secondary", label: "Secondary" }]} value={item.tier} onValueChange={(tier) => { if (tier) set(goal.goalId, { tier: tier as SeasonTier }); }}>
                <SelectTrigger aria-label="Tier" className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="primary">Primary</SelectItem><SelectItem value="secondary">Secondary</SelectItem></SelectContent>
              </Select>
              <Input aria-label="Next target" placeholder="Next target" className="min-w-48 flex-1" value={item.target} onChange={event => set(goal.goalId, { target: event.target.value })} required maxLength={1_000} />
            </div>}
          </div>;
        }) : <Hint>No goals in this season. Add goals to the next one after it starts.</Hint>}
      </FieldSet>
      {tooManyPrimary(chosen.map(goal => carry[goal.goalId]!)) && <div role="status"><Alert><AlertDescription>More than {primaryGuideline} primary goals; consider making some secondary.</AlertDescription></Alert></div>}
    </>}
  </>;
  return { fields, submit, valid, label: startNext ? "End and start next" : "End season" };
}

function EndSeason({ season, onEnd, onCancel, write }: { season: SeasonDto; onEnd: (next: NextSeason | null) => Promise<unknown>; onCancel: () => void; write: Write }) {
  const form = useEndSeason(season, onEnd);
  return <form ref={releaseFocus} className="flex min-h-0 flex-col gap-4" aria-label="End season" onSubmit={form.submit}>
    <DialogHeader><DialogTitle>End season</DialogTitle><DialogDescription>This season and its goals, tiers and targets are kept as history.</DialogDescription></DialogHeader>
    <DialogBody className="flex flex-col gap-4">
      {form.fields}
      {write.error && <FormError>{write.error}</FormError>}
    </DialogBody>
    <DialogFooter>
      <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
      <Button type="submit" data-season-action="confirm-end" disabled={write.pending || !form.valid}>{form.label}</Button>
    </DialogFooter>
  </form>;
}

/** The Season review's last step (ticket 14): the End season fields inline in the ritual panel. */
export function EndSeasonStep({ season, onEnd, write, back }: { season: SeasonDto; onEnd: (next: NextSeason | null) => Promise<unknown>; write: Write; back: ReactNode }) {
  const form = useEndSeason(season, onEnd);
  return <form ref={releaseFocus} className="flex flex-col gap-4" aria-label="End season" onSubmit={form.submit}>
    {form.fields}
    {write.error && <FormError>{write.error}</FormError>}
    <div className="flex items-center justify-between gap-2">
      {back}
      <Button type="submit" size="sm" data-season-action="confirm-end" disabled={write.pending || !form.valid}>{form.label}</Button>
    </div>
  </form>;
}

function StartSeason({ onStart, write }: { onStart: (startDate: string, lengthDays: number) => Promise<unknown>; write: Write }) {
  const { startDate, lengthDays, valid, fields } = useSeasonDates(localToday());
  async function submit(event: FormEvent) {
    event.preventDefault();
    try { await onStart(startDate, lengthDays); } catch { /* shown through write.error */ }
  }
  return <form className="my-5 flex flex-col gap-4 rounded-xl border border-border p-4" onSubmit={submit}>
    {fields}
    {write.error && <FormError>{write.error}</FormError>}
    <div><Button type="submit" data-season-action="start" disabled={write.pending || !valid}>Start season</Button></div>
  </form>;
}

const escape = (close: () => void) => (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); close(); } };

/** A goal not in the season: switching it on asks for its tier and target, then adds it. */
function OtherGoalRow({ goal, onAdd, write }: { goal: GoalDto; onAdd: (goalId: string, tier: SeasonTier, target: string) => Promise<unknown>; write: Write }) {
  const [open, setOpen] = useState(false);
  const [tier, setTier] = useState<SeasonTier>("primary");
  const [target, setTarget] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    try { await onAdd(goal.id, tier, target); } catch { /* shown through write.error */ }
  }
  return <ListRow data-season-goal={goal.id} className="items-start gap-3">
    <Switch className="mt-1" aria-label={`Include ${goal.title} in this season`} data-season-goal-action="include" checked={open} disabled={write.pending} onCheckedChange={setOpen} />
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <GoalTitle goalId={goal.id} color={goal.color} title={goal.title} />
      {open && <form ref={releaseFocus} className="flex flex-col items-start gap-2" onSubmit={submit} onKeyDown={escape(() => setOpen(false))}>
        <TierToggle value={tier} onChange={setTier} />
        <Input aria-label={`Target for ${goal.title} this season`} autoFocus value={target} onChange={event => setTarget(event.target.value)} required maxLength={1_000} placeholder="Target: what does done look like by the season's end?" />
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={write.pending || !target.trim()}>Add to season</Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
        </div>
      </form>}
    </div>
  </ListRow>;
}

/** A brand-new goal made here: created with its colour and added to this season in one step. */
function NewSeasonGoal({ count, onCreate, write }: { count: number; onCreate: (goal: NewGoal, tier: SeasonTier, target: string) => Promise<unknown>; write: Write }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState<GoalColor>(() => nextGoalColor(count));
  const [tier, setTier] = useState<SeasonTier>("primary");
  const [target, setTarget] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    try { await onCreate({ title, description, color }, tier, target); setTitle(""); setDescription(""); setTarget(""); setOpen(false); } catch { /* shown through write.error */ }
  }
  if (!open) return <Button variant="ghost" className="mt-1 -ml-2 font-normal text-muted-foreground hover:text-brand" data-season-action="add-goal" onClick={() => { setColor(nextGoalColor(count)); setOpen(true); }}><Plus className="text-brand" />New goal</Button>;
  return <form ref={releaseFocus} className="mt-3 flex flex-col gap-4 rounded-xl border border-border p-4" aria-label="New goal" onSubmit={submit} onKeyDown={escape(() => setOpen(false))}>
    <Field><FieldLabel htmlFor="season-goal-title">Goal</FieldLabel><Input id="season-goal-title" autoFocus value={title} onChange={event => setTitle(event.target.value)} required maxLength={200} placeholder="e.g. Ship the beta" /></Field>
    <Field><FieldLabel htmlFor="season-goal-description">Description <span className="font-normal text-muted-foreground">optional, shown on the goal page</span></FieldLabel>
      <Textarea id="season-goal-description" value={description} onChange={event => setDescription(event.target.value)} rows={2} maxLength={10_000} placeholder="Why this goal matters" /></Field>
    <ColorPicker value={color} onChange={setColor} />
    <FieldSet className="gap-2"><FieldLegend variant="label">Tier</FieldLegend><TierToggle value={tier} onChange={setTier} /></FieldSet>
    <Field><FieldLabel htmlFor="season-goal-target">Target this season</FieldLabel><Input id="season-goal-target" value={target} onChange={event => setTarget(event.target.value)} required maxLength={1_000} placeholder="What does done look like by the season's end?" /></Field>
    <div className="flex justify-end gap-2">
      <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
      <Button type="submit" disabled={write.pending || !title.trim() || !target.trim()}>Create and add</Button>
    </div>
  </form>;
}

/** One goal in the season: switch it off to remove it (the goal stays), change its tier, move its target (the text is replaced). */
function SeasonGoalRow({ goal, onUpdate, onRemove, write }: {
  goal: SeasonGoalDto; onUpdate: (goalId: string, patch: SeasonGoalPatch) => Promise<unknown>; onRemove: (goalId: string) => Promise<unknown>; write: Write;
}) {
  const [editing, setEditing] = useState(false);
  const [target, setTarget] = useState(goal.target);
  async function submit(event: FormEvent) {
    event.preventDefault();
    try { await onUpdate(goal.goalId, { target }); setEditing(false); } catch { /* shown through write.error */ }
  }
  return <ListRow data-season-goal={goal.goalId} className="items-start gap-3 py-2.5">
    {/* ponytail: no confirm; only this season's row and target go, the goal itself stays. */}
    <Switch className="mt-1" aria-label={`Include ${goal.title} in this season`} data-season-goal-action="include" checked disabled={write.pending}
      onCheckedChange={() => void onRemove(goal.goalId).catch(() => undefined)} />
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <GoalTitle goalId={goal.goalId} color={goal.color} title={goal.title} archived={goal.archived} />
      {editing ? <form className="flex gap-2" onSubmit={submit} onKeyDown={escape(() => setEditing(false))}>
        <Input aria-label={`Target for ${goal.title}`} autoFocus value={target} onChange={event => setTarget(event.target.value)} required maxLength={1_000} />
        <Button type="submit" disabled={write.pending || !target.trim()}>Save</Button>
      </form> : <SeasonTarget text={goal.target} />}
    </div>
    <div className="flex shrink-0 items-center gap-1">
      <TierToggle value={goal.tier} action disabled={write.pending} onChange={(tier) => void onUpdate(goal.goalId, { tier }).catch(() => undefined)} />
      <Button variant="ghost" size="icon-sm" data-season-goal-action="target" aria-label={`Move target for ${goal.title}`} title="Move target" aria-expanded={editing}
        onClick={() => { setTarget(goal.target); setEditing(!editing); }}><Pencil /></Button>
    </div>
  </ListRow>;
}
