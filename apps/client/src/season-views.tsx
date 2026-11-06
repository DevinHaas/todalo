import { useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router";
import { Target } from "lucide-react";
import type { GoalDto } from "./goals";
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
/** "2026-01-01 – 2026-03-25" (the last day is start + length - 1). */
export const seasonRange = (season: Pick<SeasonDto, "startDate" | "lengthDays">) => `${season.startDate} – ${addDays(season.startDate, season.lengthDays - 1)}`;

/** "Day 52 of 84 · 32 days left", or when it starts / that its last day passed. */
export function seasonDayLabel({ phase, day, length, daysLeft, startsIn }: Season["progress"]) {
  if (phase === "upcoming") return `Starts in ${plural(startsIn, "day")} · ${plural(length, "day")}`;
  if (phase === "over") return `All ${length} days done`;
  return `Day ${day} of ${length} · ${daysLeft ? `${plural(daysLeft, "day")} left` : "last day"}`;
}

export function SeasonView({ state, goals, past, onRetry, onStart, onAdd, onUpdate, onRemove, onEnd, write }: {
  state: ReadState<CurrentSeasonDto>; goals: GoalDto[]; past: SeasonDto[]; onRetry: () => void;
  onStart: (startDate: string, lengthDays: number) => Promise<unknown>;
  onAdd: (goalId: string, tier: SeasonTier, target: string) => Promise<unknown>;
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
    <p className="state">A season is the time box your goals are planned against. Start one to commit goals to it.</p>
    <StartSeason onStart={onStart} write={write} />
    <PastSeasons seasons={past} />
  </div>;
  const available = goals.filter(goal => !season.goals.some(item => item.goalId === goal.id));
  const primary = season.goals.filter(goal => goal.tier === "primary");
  return <div className="season-page" data-season-id={season.id}>
    <div className="project-header">
      <h1 className="page-title">Season</h1>
      {!ending && <button type="button" className="button outline" data-season-action="end" onClick={() => setEnding(true)}>End season</button>}
    </div>
    <p className="season-days" data-season-phase={season.progress.phase}><strong>{seasonDayLabel(season.progress)}</strong>
      <span> · from {season.startDate}</span></p>
    {tooManyPrimary(season.goals) && <p className="season-warning" role="status">
      {primary.length} primary goals. Around {primaryGuideline} keeps your best time protected; consider making some secondary.
    </p>}
    {write.error && <p className="form-error" role="alert">{write.error}</p>}
    {ending ? <EndSeason season={season} onEnd={onEnd} onCancel={() => setEnding(false)} write={write} /> : <>
      <TierSections goals={season.goals} row={goal => <SeasonGoalRow key={goal.id} goal={goal} onUpdate={onUpdate} onRemove={onRemove} write={write} />}
        empty={{ primary: "No primary goals yet. These get your best time.", secondary: "No secondary goals. These are the first to drop when time runs short." }} />
      <AddSeasonGoal goals={available} onAdd={onAdd} write={write} />
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
    <p className="state">This season does not exist or is still running. <Link to="/season">Back to the season</Link></p></div>;
  return <div className="season-page" data-season-id={season.id}>
    <h1 className="page-title">Season {seasonRange(season)}</h1>
    <p className="season-days">{plural(season.lengthDays, "day")}{season.endedAt && ` · ended ${season.endedAt.slice(0, 10)}`} · <Link to="/season">Current season</Link></p>
    <TierSections goals={season.goals} empty={{ primary: "No primary goals.", secondary: "No secondary goals." }} row={goal => <li key={goal.id} data-season-goal={goal.goalId}>
      <div className="season-goal">
        <Link to={`/goals/${encodeURIComponent(goal.goalId)}`}><Target />{goal.title}</Link>
        <p className="season-target">{goal.target}</p>
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

function AddSeasonGoal({ goals, onAdd, write }: { goals: GoalDto[]; onAdd: (goalId: string, tier: SeasonTier, target: string) => Promise<unknown>; write: Write }) {
  const [open, setOpen] = useState(false);
  const [goalId, setGoalId] = useState("");
  const [tier, setTier] = useState<SeasonTier>("primary");
  const [target, setTarget] = useState("");
  const chosen = goals.some(goal => goal.id === goalId) ? goalId : goals[0]?.id ?? "";
  async function submit(event: FormEvent) {
    event.preventDefault();
    try { await onAdd(chosen, tier, target); setTarget(""); setOpen(false); } catch { /* shown through write.error */ }
  }
  if (!open) return <div className="project-actions season-add">
    <button type="button" className="button outline" data-season-action="add-goal" disabled={!goals.length} onClick={() => setOpen(true)}>Add goal to season</button>
    {!goals.length && <span className="state">Every active goal is in this season. Create one with + next to Goals.</span>}
  </div>;
  return <form ref={releaseFocus} className="goal-edit season-add" onSubmit={submit} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setOpen(false); } }}>
    <label>Goal<select autoFocus value={chosen} onChange={event => setGoalId(event.target.value)}>{goals.map(goal => <option key={goal.id} value={goal.id}>{goal.title}</option>)}</select></label>
    <label>Tier<select value={tier} onChange={event => setTier(event.target.value as SeasonTier)}><option value="primary">Primary</option><option value="secondary">Secondary</option></select></label>
    <label>Target this season<input value={target} onChange={event => setTarget(event.target.value)} required maxLength={1_000} placeholder="What does done look like by the season's end?" /></label>
    <div className="project-actions">
      <button type="submit" className="button" disabled={write.pending || !chosen || !target.trim()}>Add goal</button>
      <button type="button" className="button outline" onClick={() => setOpen(false)}>Cancel</button>
    </div>
  </form>;
}

/** One goal in the season: its target, moved in place (the text is replaced), and its tier. */
function SeasonGoalRow({ goal, onUpdate, onRemove, write }: {
  goal: SeasonGoalDto; onUpdate: (goalId: string, patch: SeasonGoalPatch) => Promise<unknown>; onRemove: (goalId: string) => Promise<unknown>; write: Write;
}) {
  const [editing, setEditing] = useState(false);
  const [target, setTarget] = useState(goal.target);
  async function submit(event: FormEvent) {
    event.preventDefault();
    try { await onUpdate(goal.goalId, { target }); setEditing(false); } catch { /* shown through write.error */ }
  }
  const other = goal.tier === "primary" ? "secondary" : "primary";
  return <li data-season-goal={goal.goalId}>
    <div className="season-goal">
      <Link to={`/goals/${encodeURIComponent(goal.goalId)}`}><Target />{goal.title}</Link>
      {editing ? <form className="inline-form" onSubmit={submit} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setEditing(false); } }}>
        <input aria-label={`Target for ${goal.title}`} autoFocus value={target} onChange={event => setTarget(event.target.value)} required maxLength={1_000} />
        <button type="submit" className="button" disabled={write.pending || !target.trim()}>Save</button>
      </form> : <p className="season-target">{goal.target}</p>}
    </div>
    <div className="project-actions">
      <button type="button" className="text-action" data-season-goal-action="target" aria-expanded={editing} onClick={() => { setTarget(goal.target); setEditing(!editing); }}>Move target</button>
      <button type="button" className="text-action" data-season-goal-action="tier" disabled={write.pending} onClick={() => void onUpdate(goal.goalId, { tier: other }).catch(() => undefined)}>Make {other}</button>
      {/* ponytail: no confirm; only this season's row and target go, the goal itself stays. */}
      <button type="button" className="text-action" data-season-goal-action="remove" disabled={write.pending} onClick={() => void onRemove(goal.goalId).catch(() => undefined)}>Remove from season</button>
    </div>
  </li>;
}
