import { useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { Link, NavLink } from "react-router";
import { CalendarRange, History, Pencil, Plus } from "lucide-react";
import { nextGoalColor, type GoalColor, type GoalDto, type NewGoal } from "./goals";
import { ColorPicker, GoalDot } from "./goal-views";
import { primaryGuideline, seasonLengths, tooManyPrimary, type CurrentSeasonDto, type NextSeason, type SeasonDto, type SeasonGoalDto, type SeasonGoalPatch, type SeasonTier } from "./seasons";
import { Failure, type ReadState } from "./views";
import { releaseFocus } from "./software-keyboard";

// Pure season views (goals tickets 04-05): no runtime imports.
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

/** The sidebar's Seasons section, separate from Goals: the current season (or a way to start one) and the latest past ones. */
export function SeasonsNav({ current, past }: { current: Season | null; past: SeasonDto[] }) {
  return <section className="goal-nav season-nav" aria-label="Seasons">
    <div className="nav-group-head"><span>Seasons</span></div>
    {current ? <NavLink to="/season" end className="nav-item"><CalendarRange /><span>Current season</span><span className="nav-badge">{seasonShortLabel(current.progress)}</span></NavLink>
      : <NavLink to="/season" end className="nav-item muted-item"><Plus /><span>Start a season</span></NavLink>}
    {/* ponytail: the latest three; the season page lists them all. */}
    {past.slice(0, 3).map(season => <NavLink key={season.id} to={`/season/${encodeURIComponent(season.id)}`} className="nav-item muted-item"><History /><span>{seasonRange(season)}</span></NavLink>)}
  </section>;
}

/** Primary/Secondary as a two-button switch; `data-season-goal-action="tier"` is the other tier (Shift+P). */
function TierToggle({ value, onChange, disabled, action }: { value: SeasonTier; onChange(tier: SeasonTier): void; disabled?: boolean; action?: boolean }) {
  return <div className="segmented tier-toggle" role="group" aria-label="Tier">
    {(["primary", "secondary"] as const).map(tier => <button key={tier} type="button" aria-pressed={value === tier} disabled={disabled}
      data-season-goal-action={action && value !== tier ? "tier" : undefined} onClick={() => { if (value !== tier) onChange(tier); }}>{tier === "primary" ? "Primary" : "Secondary"}</button>)}
  </div>;
}

/** A season target with its label, so it never reads as the goal's description. */
const Target = ({ text }: { text: string }) => <p className="season-target"><span className="target-label">Target</span>{text}</p>;

/** "Day 52 of 84 · 32 days left", or when it starts / that its last day passed. */
export function seasonDayLabel({ phase, day, length, daysLeft, startsIn }: Season["progress"]) {
  if (phase === "upcoming") return `Starts in ${plural(startsIn, "day")} · ${plural(length, "day")}`;
  if (phase === "over") return `All ${length} days done`;
  return `Day ${day} of ${length} · ${daysLeft ? `${plural(daysLeft, "day")} left` : "last day"}`;
}

export function SeasonView({ state, goals, past, onRetry, onStart, onAdd, onCreate, onUpdate, onRemove, onEnd, write }: {
  state: ReadState<CurrentSeasonDto>; goals: GoalDto[]; past: SeasonDto[]; onRetry: () => void;
  onStart: (startDate: string, lengthDays: number) => Promise<unknown>;
  onAdd: (goalId: string, tier: SeasonTier, target: string) => Promise<unknown>;
  /** Creates a goal and adds it to this season. */
  onCreate: (goal: NewGoal, tier: SeasonTier, target: string) => Promise<unknown>;
  onUpdate: (goalId: string, patch: SeasonGoalPatch) => Promise<unknown>;
  onRemove: (goalId: string) => Promise<unknown>;
  onEnd: (next: NextSeason | null) => Promise<unknown>; write: Write;
}) {
  const [ending, setEnding] = useState(false);
  if (state.status === "pending") return <p className="state" role="status">Loading season…</p>;
  if (state.status === "error") return <Failure error={state.error} onRetry={onRetry} />;
  const season = state.data?.season;
  if (!season) return <div className="season-page">
    <h1 className="page-title">Season</h1>
    <p className="state">A season is the time box your goals are planned against. Start one, then choose which goals it commits to.</p>
    <StartSeason onStart={onStart} write={write} />
    <PastSeasons seasons={past} />
  </div>;
  const available = goals.filter(goal => !season.goals.some(item => item.goalId === goal.id));
  const primary = season.goals.filter(goal => goal.tier === "primary");
  const { day, length, phase } = season.progress;
  return <div className="season-page" data-season-id={season.id}>
    <div className="project-header">
      <h1 className="page-title">Season</h1>
      {!ending && <button type="button" className="button outline small" data-season-action="end" onClick={() => setEnding(true)}>End season</button>}
    </div>
    <p className="season-days" data-season-phase={phase}><strong>{seasonDayLabel(season.progress)}</strong><span> · {seasonRange(season)}</span></p>
    <div className="season-bar" aria-hidden="true"><span style={{ "--share": `${phase === "upcoming" ? 0 : Math.round(day / length * 100)}%` } as CSSProperties} /></div>
    {tooManyPrimary(season.goals) && <p className="season-warning" role="status">
      {primary.length} primary goals. Around {primaryGuideline} keeps your best time protected; consider making some secondary.
    </p>}
    {write.error && <p className="form-error" role="alert">{write.error}</p>}
    {ending ? <EndSeason season={season} onEnd={onEnd} onCancel={() => setEnding(false)} write={write} /> : <>
      <TierSections goals={season.goals} row={goal => <SeasonGoalRow key={goal.id} goal={goal} onUpdate={onUpdate} onRemove={onRemove} write={write} />}
        empty={{ primary: "No primary goals yet. These get your best time.", secondary: "No secondary goals. These are the first to drop when time runs short." }} />
      <section className="goal-links" aria-label="Other goals">
        <h2 className="section-heading">Not in this season</h2>
        {available.length ? <ul className="goal-link-list season-goals">{available.map(goal => <OtherGoalRow key={goal.id} goal={goal} onAdd={onAdd} write={write} />)}</ul>
          : <p className="state">Every active goal is in this season.</p>}
        <NewSeasonGoal count={goals.length} onCreate={onCreate} write={write} />
      </section>
    </>}
    <PastSeasons seasons={past} />
  </div>;
}

function TierSections({ goals, row, empty }: { goals: SeasonGoalDto[]; row: (goal: SeasonGoalDto) => ReactNode; empty: Record<SeasonTier, string> }) {
  return (["primary", "secondary"] as const).map(tier => {
    const items = goals.filter(goal => goal.tier === tier);
    return <section key={tier} className="goal-links" aria-label={tier === "primary" ? "Primary goals" : "Secondary goals"}>
      <h2 className="section-heading">{tier === "primary" ? "Primary" : "Secondary"}</h2>
      {items.length ? <ul className="goal-link-list season-goals">{items.map(row)}</ul> : <p className="state">{empty[tier]}</p>}
    </section>;
  });
}

function PastSeasons({ seasons }: { seasons: SeasonDto[] }) {
  if (!seasons.length) return null;
  return <section className="goal-links season-past" aria-label="Past seasons">
    <h2 className="section-heading">Past seasons</h2>
    <ul className="goal-link-list">{seasons.map(season => <li key={season.id}>
      <Link to={`/season/${encodeURIComponent(season.id)}`}>{seasonRange(season)}</Link>
      <span className="state">{plural(season.goals.length, "goal")}</span>
    </li>)}</ul>
  </section>;
}

/** A past season, read-only: its goals with the tiers and targets they had. */
export function PastSeasonView({ state, id, onRetry }: { state: ReadState<SeasonDto[]>; id: string; onRetry: () => void }) {
  if (state.status === "pending") return <p className="state" role="status">Loading season…</p>;
  if (state.status === "error") return <Failure error={state.error} onRetry={onRetry} />;
  const season = state.data?.find(item => item.id === id);
  if (!season) return <div className="season-page"><h1 className="page-title">Season</h1>
    <p className="state">This season does not exist or is still running.</p><Link className="button outline small" to="/season">Current season</Link></div>;
  return <div className="season-page" data-season-id={season.id}>
    <div className="project-header">
      <h1 className="page-title">Season {seasonRange(season)}</h1>
      <Link className="button outline small" to="/season">Current season</Link>
    </div>
    <p className="season-days">{plural(season.lengthDays, "day")}{season.endedAt && ` · ended ${fullDay.format(new Date(season.endedAt))}`}</p>
    <TierSections goals={season.goals} empty={{ primary: "No primary goals.", secondary: "No secondary goals." }} row={goal => <li key={goal.id} data-season-goal={goal.goalId}>
      <div className="season-goal">
        <Link className="season-goal-title" to={`/goals/${encodeURIComponent(goal.goalId)}`}><GoalDot color={goal.color} />{goal.title}</Link>
        <Target text={goal.target} />
      </div>
    </li>} />
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
    <label>Start date<input type="date" required value={startDate} onChange={event => setStartDate(event.target.value)} /></label>
    <fieldset className="season-lengths"><legend>Length</legend>
      <label><input type="radio" name="season-length" checked={choice === "long"} onChange={() => setChoice("long")} />12 weeks</label>
      <label><input type="radio" name="season-length" checked={choice === "short"} onChange={() => setChoice("short")} />4 weeks</label>
      <label><input type="radio" name="season-length" checked={choice === "custom"} onChange={() => setChoice("custom")} />Custom</label>
      {choice === "custom" && <label>Days<input type="number" min={1} max={366} step={1} required value={custom} onChange={event => setCustom(event.target.value)} /></label>}
    </fieldset>
  </>;
  return { startDate, lengthDays, valid, fields };
}

/**
 * Season review in one form: which goals continue, each with a fresh tier and
 * target, and the next season's dates. Ending and starting are one server write.
 */
function EndSeason({ season, onEnd, onCancel, write }: { season: SeasonDto; onEnd: (next: NextSeason | null) => Promise<unknown>; onCancel: () => void; write: Write }) {
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
  return <form ref={releaseFocus} className="goal-edit season-end" aria-label="End season" onSubmit={submit} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onCancel(); } }}>
    <p className="state">This season and its goals, tiers and targets are kept as history.</p>
    <label className="season-check"><input type="checkbox" checked={startNext} onChange={event => setStartNext(event.target.checked)} />Start the next season now</label>
    {startNext && <>
      {dates.fields}
      <fieldset className="season-carry"><legend>Goals that continue</legend>
        {season.goals.length ? season.goals.map(goal => {
          const item = carry[goal.goalId]!;
          return <div key={goal.id} className="season-carry-goal" data-season-carry={goal.goalId}>
            <label className="season-check"><input type="checkbox" checked={item.on} disabled={goal.archived} onChange={event => set(goal.goalId, { on: event.target.checked })} />
              {goal.title}{goal.archived && " (archived)"}</label>
            {item.on && <>
              <label>Tier<select value={item.tier} onChange={event => set(goal.goalId, { tier: event.target.value as SeasonTier })}><option value="primary">Primary</option><option value="secondary">Secondary</option></select></label>
              <label>Next target<input value={item.target} onChange={event => set(goal.goalId, { target: event.target.value })} required maxLength={1_000} /></label>
            </>}
          </div>;
        }) : <p className="state">No goals in this season. Add goals to the next one after it starts.</p>}
      </fieldset>
      {tooManyPrimary(chosen.map(goal => carry[goal.goalId]!)) && <p className="season-warning" role="status">More than {primaryGuideline} primary goals; consider making some secondary.</p>}
    </>}
    <div className="project-actions">
      <button type="submit" className="button" data-season-action="confirm-end" disabled={write.pending || !valid}>{startNext ? "End and start next" : "End season"}</button>
      <button type="button" className="button outline" onClick={onCancel}>Cancel</button>
    </div>
  </form>;
}

function StartSeason({ onStart, write }: { onStart: (startDate: string, lengthDays: number) => Promise<unknown>; write: Write }) {
  const { startDate, lengthDays, valid, fields } = useSeasonDates(localToday());
  async function submit(event: FormEvent) {
    event.preventDefault();
    try { await onStart(startDate, lengthDays); } catch { /* shown through write.error */ }
  }
  return <form className="goal-edit season-start" onSubmit={submit}>
    {fields}
    {write.error && <p className="form-error" role="alert">{write.error}</p>}
    <div className="project-actions"><button type="submit" className="button" data-season-action="start" disabled={write.pending || !valid}>Start season</button></div>
  </form>;
}

/** A goal not in the season: switching it on asks for its tier and target, then adds it. */
function OtherGoalRow({ goal, onAdd, write }: { goal: GoalDto; onAdd: (goalId: string, tier: SeasonTier, target: string) => Promise<unknown>; write: Write }) {
  const [open, setOpen] = useState(false);
  const [tier, setTier] = useState<SeasonTier>("primary");
  const [target, setTarget] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    try { await onAdd(goal.id, tier, target); } catch { /* shown through write.error */ }
  }
  return <li data-season-goal={goal.id} className="season-goal-row">
    <input type="checkbox" role="switch" className="switch" aria-label={`Include ${goal.title} in this season`} data-season-goal-action="include" checked={open} disabled={write.pending}
      onChange={(event) => setOpen(event.target.checked)} />
    <div className="season-goal">
      <Link className="season-goal-title" to={`/goals/${encodeURIComponent(goal.id)}`}><GoalDot color={goal.color} />{goal.title}</Link>
      {open && <form ref={releaseFocus} className="season-include" onSubmit={submit} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setOpen(false); } }}>
        <TierToggle value={tier} onChange={setTier} />
        <input aria-label={`Target for ${goal.title} this season`} autoFocus value={target} onChange={event => setTarget(event.target.value)} required maxLength={1_000} placeholder="Target: what does done look like by the season's end?" />
        <div className="project-actions">
          <button type="submit" className="button small" disabled={write.pending || !target.trim()}>Add to season</button>
          <button type="button" className="button ghost small" onClick={() => setOpen(false)}>Cancel</button>
        </div>
      </form>}
    </div>
  </li>;
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
  if (!open) return <button type="button" className="sheet-add season-new" data-season-action="add-goal" onClick={() => { setColor(nextGoalColor(count)); setOpen(true); }}><Plus />New goal</button>;
  return <form ref={releaseFocus} className="goal-edit season-new-form" aria-label="New goal" onSubmit={submit} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setOpen(false); } }}>
    <label>Goal<input autoFocus value={title} onChange={event => setTitle(event.target.value)} required maxLength={200} placeholder="e.g. Ship the beta" /></label>
    <label>Description <span className="field-hint">optional, shown on the goal page</span><textarea value={description} onChange={event => setDescription(event.target.value)} rows={2} maxLength={10_000} placeholder="Why this goal matters" /></label>
    <ColorPicker value={color} onChange={setColor} />
    <div className="field">Tier<TierToggle value={tier} onChange={setTier} /></div>
    <label>Target this season<input value={target} onChange={event => setTarget(event.target.value)} required maxLength={1_000} placeholder="What does done look like by the season's end?" /></label>
    <div className="project-actions">
      <button type="submit" className="button" disabled={write.pending || !title.trim() || !target.trim()}>Create and add</button>
      <button type="button" className="button outline" onClick={() => setOpen(false)}>Cancel</button>
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
  return <li data-season-goal={goal.goalId} className="season-goal-row">
    {/* ponytail: no confirm; only this season's row and target go, the goal itself stays. */}
    <input type="checkbox" role="switch" className="switch" aria-label={`Include ${goal.title} in this season`} data-season-goal-action="include" checked disabled={write.pending}
      onChange={() => void onRemove(goal.goalId).catch(() => undefined)} />
    <div className="season-goal">
      <Link className="season-goal-title" to={`/goals/${encodeURIComponent(goal.goalId)}`}><GoalDot color={goal.color} />{goal.title}{goal.archived && <span className="state"> (archived)</span>}</Link>
      {editing ? <form className="inline-form" onSubmit={submit} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setEditing(false); } }}>
        <input aria-label={`Target for ${goal.title}`} autoFocus value={target} onChange={event => setTarget(event.target.value)} required maxLength={1_000} />
        <button type="submit" className="button small" disabled={write.pending || !target.trim()}>Save</button>
      </form> : <Target text={goal.target} />}
    </div>
    <div className="season-goal-tools">
      <TierToggle value={goal.tier} action disabled={write.pending} onChange={(tier) => void onUpdate(goal.goalId, { tier }).catch(() => undefined)} />
      <button type="button" className="icon-button" data-season-goal-action="target" aria-label={`Move target for ${goal.title}`} title="Move target" aria-expanded={editing}
        onClick={() => { setTarget(goal.target); setEditing(!editing); }}><Pencil /></button>
    </div>
  </li>;
}
