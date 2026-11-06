import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { Target } from "lucide-react";
import type { GoalDto } from "./goals";
import { primaryGuideline, seasonLengths, tooManyPrimary, type CurrentSeasonDto, type SeasonGoalDto, type SeasonGoalPatch, type SeasonTier } from "./seasons";
import { Failure, type ReadState } from "./views";
import { releaseFocus } from "./software-keyboard";

// Pure season views (goals ticket 04): no runtime imports.
type Write = { pending: boolean; error: string | null };
type Season = NonNullable<CurrentSeasonDto["season"]>;

/** Today as the date input's value, in the device's own zone. */
const localToday = () => { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10); };
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** "Day 52 of 84 · 32 days left", or when it starts / that its last day passed. */
export function seasonDayLabel({ phase, day, length, daysLeft, startsIn }: Season["progress"]) {
  if (phase === "upcoming") return `Starts in ${plural(startsIn, "day")} · ${plural(length, "day")}`;
  if (phase === "over") return `All ${length} days done`;
  return `Day ${day} of ${length} · ${daysLeft ? `${plural(daysLeft, "day")} left` : "last day"}`;
}

export function SeasonView({ state, goals, onRetry, onStart, onAdd, onUpdate, write }: {
  state: ReadState<CurrentSeasonDto>; goals: GoalDto[]; onRetry: () => void;
  onStart: (startDate: string, lengthDays: number) => Promise<unknown>;
  onAdd: (goalId: string, tier: SeasonTier, target: string) => Promise<unknown>;
  onUpdate: (goalId: string, patch: SeasonGoalPatch) => Promise<unknown>; write: Write;
}) {
  if (state.status === "pending") return <p className="state" role="status">Loading season…</p>;
  if (state.status === "error") return <Failure error={state.error} onRetry={onRetry} />;
  const season = state.data?.season;
  if (!season) return <div className="season-page">
    <h1 className="page-title">Season</h1>
    <p className="state">A season is the time box your goals are planned against. Start one to commit goals to it.</p>
    <StartSeason onStart={onStart} write={write} />
  </div>;
  const available = goals.filter(goal => !season.goals.some(item => item.goalId === goal.id));
  const primary = season.goals.filter(goal => goal.tier === "primary");
  return <div className="season-page" data-season-id={season.id}>
    <div className="project-header">
      <h1 className="page-title">Season</h1>
    </div>
    <p className="season-days" data-season-phase={season.progress.phase}><strong>{seasonDayLabel(season.progress)}</strong>
      <span> · from {season.startDate}</span></p>
    {tooManyPrimary(season.goals) && <p className="season-warning" role="status">
      {primary.length} primary goals. Around {primaryGuideline} keeps your best time protected; consider making some secondary.
    </p>}
    {write.error && <p className="form-error" role="alert">{write.error}</p>}
    {(["primary", "secondary"] as const).map(tier => {
      const items = season.goals.filter(goal => goal.tier === tier);
      return <section key={tier} className="goal-links" aria-label={tier === "primary" ? "Primary goals" : "Secondary goals"}>
        <h2 className="section-heading">{tier === "primary" ? "Primary" : "Secondary"}</h2>
        {items.length ? <ul className="goal-link-list season-goals">{items.map(goal => <SeasonGoalRow key={goal.id} goal={goal} onUpdate={onUpdate} write={write} />)}</ul>
          : <p className="state">{tier === "primary" ? "No primary goals yet. These get your best time." : "No secondary goals. These are the first to drop when time runs short."}</p>}
      </section>;
    })}
    <AddSeasonGoal goals={available} onAdd={onAdd} write={write} />
  </div>;
}

function StartSeason({ onStart, write }: { onStart: (startDate: string, lengthDays: number) => Promise<unknown>; write: Write }) {
  const [startDate, setStartDate] = useState(localToday);
  const [choice, setChoice] = useState<"long" | "short" | "custom">("long");
  const [custom, setCustom] = useState("42");
  const lengthDays = choice === "custom" ? Number(custom) : seasonLengths[choice];
  const valid = Boolean(startDate) && Number.isInteger(lengthDays) && lengthDays >= 1 && lengthDays <= 366;
  async function submit(event: FormEvent) {
    event.preventDefault();
    try { await onStart(startDate, lengthDays); } catch { /* shown through write.error */ }
  }
  return <form className="goal-edit season-start" onSubmit={submit}>
    <label>Start date<input type="date" required value={startDate} onChange={event => setStartDate(event.target.value)} /></label>
    <fieldset className="season-lengths"><legend>Length</legend>
      <label><input type="radio" name="season-length" checked={choice === "long"} onChange={() => setChoice("long")} />12 weeks</label>
      <label><input type="radio" name="season-length" checked={choice === "short"} onChange={() => setChoice("short")} />4 weeks</label>
      <label><input type="radio" name="season-length" checked={choice === "custom"} onChange={() => setChoice("custom")} />Custom</label>
      {choice === "custom" && <label>Days<input type="number" min={1} max={366} step={1} required value={custom} onChange={event => setCustom(event.target.value)} /></label>}
    </fieldset>
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
function SeasonGoalRow({ goal, onUpdate, write }: { goal: SeasonGoalDto; onUpdate: (goalId: string, patch: SeasonGoalPatch) => Promise<unknown>; write: Write }) {
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
    </div>
  </li>;
}
