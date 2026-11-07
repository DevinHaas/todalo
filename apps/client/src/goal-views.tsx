import { useState, type CSSProperties, type FormEvent } from "react";
import { Link, NavLink } from "react-router";
import { CalendarRange, Hash, Pencil, Plus, Target, X } from "lucide-react";
import { criteriaProgress, goalColorKeys, goalColorValue, type GoalColor, type GoalDetailDto, type GoalDto, type GoalLinkKind, type GoalPatch, type MilestoneDto } from "./goals";
import type { SeasonTier } from "./seasons";
import { taskPath } from "./links";
import { Dropdown, Popover } from "./popover";
import type { ReorderPosition } from "./bulk";
import { SortableRow, SortableTasks } from "./bulk-views";
import { Failure, MilestoneMark, type ReadState } from "./views";
import { releaseFocus } from "./software-keyboard";

// Pure goal views (goals ticket 01): no runtime imports.
type Write = { pending: boolean; error: string | null };

/** A goal's colour as its icon: sidebar, goal page, season page, task sheet chips. */
export const GoalDot = ({ color }: { color: string }) => <span className="goal-dot" aria-hidden="true" style={{ background: goalColorValue(color) }} />;

const colorNames: Record<GoalColor, string> = { blue: "Blue", green: "Green", orange: "Orange", violet: "Violet", pink: "Pink", teal: "Teal", amber: "Amber", red: "Red", indigo: "Indigo", slate: "Slate" };
/** The fixed palette as radio swatches (arrow keys move between them). */
export function ColorPicker({ value, onChange }: { value: GoalColor; onChange(color: GoalColor): void }) {
  return <fieldset className="color-picker"><legend>Colour</legend>
    <div className="color-swatches">{goalColorKeys.map(color => <label key={color} className="color-swatch" title={colorNames[color]} style={{ "--swatch": goalColorValue(color) } as CSSProperties}>
      <input type="radio" name="goal-color" value={color} checked={value === color} aria-label={colorNames[color]} onChange={() => onChange(color)} />
    </label>)}</div>
  </fieldset>;
}

/** The sidebar's Goals section, above Projects: drag (or keyboard) to reorder; + adds one. */
export function GoalsNav({ goals, adding, onAdding, onCreate, onReorder, write }: {
  goals: GoalDto[]; adding: boolean; onAdding: (adding: boolean) => void;
  onCreate: (title: string) => Promise<unknown>; onReorder: (id: string, anchorId: string, position: ReorderPosition) => void; write: Write;
}) {
  const [title, setTitle] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    try { await onCreate(title); setTitle(""); onAdding(false); } catch { /* shown through write.error */ }
  }
  return <section className="goal-nav" aria-label="Goals">
    <div className="nav-group-head">
      <span>Goals</span>
      <button type="button" className="icon-button" aria-label="Add goal" aria-expanded={adding} data-goal-action="create" onClick={() => onAdding(!adding)}><Plus /></button>
    </div>
    {adding && <form className="inline-form goal-add" onSubmit={submit} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onAdding(false); } }}>
      <input aria-label="New goal title" placeholder="New goal" autoFocus value={title} onChange={event => setTitle(event.target.value)} required maxLength={200} />
      <button type="submit" className="button" disabled={write.pending || !title.trim()}>Add</button>
    </form>}
    {write.error && <p className="form-error" role="alert">{write.error}</p>}
    <SortableTasks ids={goals.map(goal => goal.id)} label={(id) => goals.find(goal => goal.id === id)?.title ?? "goal"} onReorder={onReorder}>
      {goals.map(goal => <SortableRow key={goal.id} id={goal.id} title={goal.title}>
        <NavLink to={`/goals/${encodeURIComponent(goal.id)}`} className="nav-item"><GoalDot color={goal.color} /><span>{goal.title}</span></NavLink>
      </SortableRow>)}
    </SortableTasks>
  </section>;
}

/** Linking from a task sheet or project page (ticket 02): the active goals, and which this task or project links to. */
export interface GoalSlots {
  goals: GoalDto[]; linked: string[]; onToggle(goalId: string, linked: boolean): void; error: string | null;
  /** Ticket 03 (tasks only): goals suggested while the task has none, best first. Accepting is onToggle(id, true). */
  suggested?: GoalDto[]; onDismiss?(goalId: string): void;
}

/** The best suggestion as a hint under the Goals field: Link it or dismiss it; nothing links without a click. */
export function GoalSuggestion({ slots }: { slots: GoalSlots }) {
  const goal = slots.suggested?.[0];
  if (!goal) return null;
  return <p className="goal-suggestion" data-goal-suggestion={goal.id}>
    <Target /><span>Suggested: {goal.title}</span>
    <button type="button" className="text-action" data-suggestion="accept" onClick={() => slots.onToggle(goal.id, true)}>Link</button>
    <button type="button" className="icon-button" data-suggestion="dismiss" aria-label={`Dismiss suggestion ${goal.title}`} title="Dismiss" onClick={() => slots.onDismiss?.(goal.id)}><X /></button>
  </p>;
}

/**
 * Checkboxes over the active goals; each tick links or unlinks at once.
 * `property` is the task sheet's chip row, `button` the project header's button.
 */
export function GoalPicker({ slots, variant, data }: { slots: GoalSlots; variant: "property" | "button"; data?: Partial<Record<`data-${string}`, string>> }) {
  const chosen = slots.goals.filter(goal => slots.linked.includes(goal.id));
  const chips = <span className="label-chips">{chosen.map(goal => <span key={goal.id} className="label-chip"><GoalDot color={goal.color} />{goal.title}</span>)}</span>;
  return <>
    <Popover label={chosen.length ? `Goals: ${chosen.map(goal => goal.title).join(", ")}` : "Link goals"} data={data}
      triggerClassName={variant === "button" ? "button outline" : chosen.length ? "property-value" : "icon-button property-add"}
      trigger={variant === "button" ? <><Target />{chosen.length ? `Goals · ${chosen.length}` : "Goals"}</> : chosen.length ? chips : <Plus />}>
      {() => <fieldset className="label-choices property-panel"><legend>Goals</legend>
        {slots.goals.length > 0 && <div className="label-options">{slots.goals.map(goal => <label key={goal.id} className="label-option">
          <input type="checkbox" checked={slots.linked.includes(goal.id)} onChange={(event) => slots.onToggle(goal.id, event.target.checked)} /><GoalDot color={goal.color} />{goal.title}
        </label>)}</div>}
        {!slots.goals.length && <p className="state">Create a goal with + next to Goals in the sidebar.</p>}
      </fieldset>}
    </Popover>
    {slots.error && <p className="form-error" role="alert">{slots.error}</p>}
  </>;
}

/** Ticket 06: the task sheet's milestone, for one of the task's linked goals. Every change saves at once. */
export interface MilestoneSlots {
  /** The task's linked, active goals (a milestone needs a link); empty explains that. */
  goals: GoalDto[]; milestone: MilestoneDto | null; onChange(milestone: MilestoneDto | null): void; error: string | null;
}

/**
 * The task sheet's Milestone property: a switch (for the only linked goal, or
 * the first, with a picker when there are more). The done criteria are the
 * sheet's Done criteria section.
 */
export function MilestoneToggle({ slots }: { slots: MilestoneSlots }) {
  const { goals, milestone } = slots;
  const goal = milestone && goals.find(item => item.id === milestone.goalId);
  const unlinked = !goals.length && !milestone;
  return <div className="milestone-toggle">
    <label className="milestone-switch">
      <input type="checkbox" role="switch" className="switch" data-field="milestone" checked={Boolean(milestone)} disabled={unlinked}
        onChange={(event) => slots.onChange(event.target.checked ? { goalId: goals[0]!.id, criteria: [] } : null)} />
      <span>{milestone ? "Milestone" : "Not a milestone"}</span>
    </label>
    {unlinked && <p className="property-hint">Link this task to a goal first; a milestone marks progress toward one.</p>}
    {milestone && goals.length > 1 && <Dropdown label="Milestone for" value={milestone.goalId} className="property-value" chevron={false}
      options={goals.map(item => ({ value: item.id, label: item.title, icon: <GoalDot color={item.color} /> }))}
      onChange={(goalId) => slots.onChange({ ...milestone, goalId })} />}
    {milestone && goals.length <= 1 && goal && <span className="property-hint milestone-goal"><GoalDot color={goal.color} />for {goal.title}</span>}
    {slots.error && <p className="form-error" role="alert">{slots.error}</p>}
  </div>;
}

/** The in-page confirm for completing a milestone with open done criteria (native confirm() is unreliable in iOS WKWebView). */
export function CriteriaConfirm({ onAnswer }: { onAnswer(confirmed: boolean): void }) {
  return <div className="dialog-backdrop criteria-confirm" onClick={(event) => { if (event.target === event.currentTarget) onAnswer(false); }}>
    <div role="alertdialog" aria-modal="true" aria-label="Complete milestone" aria-describedby="criteria-confirm" className="dialog"
      onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onAnswer(false); } }}>
      <p id="criteria-confirm">This milestone has open done criteria. Complete it and tick them all?</p>
      <div className="project-actions">
        <button type="button" className="button" autoFocus onClick={() => onAnswer(true)}>Complete and tick all</button>
        <button type="button" className="button outline" onClick={() => onAnswer(false)}>Cancel</button>
      </div>
    </div>
  </div>;
}

/** The goal's place in the current season (null when it is not in one). */
export interface GoalSeason { tier: SeasonTier; target: string }

/**
 * A goal's page: title, colour and description, edited in place; archiving
 * keeps its data. Shows its season target (that lives on the season, not the
 * goal) and lists its milestones and linked projects and tasks.
 */
export function GoalView({ state, season, onRetry, onSave, onArchive, onUnlink, write }: {
  state: ReadState<GoalDetailDto | null>; season?: GoalSeason | null; onRetry: () => void; onSave: (patch: GoalPatch) => Promise<unknown>; onArchive: (archived: boolean) => void;
  /** Removes only the link; the project or task stays. */
  onUnlink: (kind: GoalLinkKind, targetId: string) => void; write: Write;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState<GoalColor>("blue");
  if (state.status === "pending") return <p className="state" role="status">Loading goal…</p>;
  if (state.status === "error") return <Failure error={state.error} onRetry={onRetry} />;
  if (!state.data) return <div><h1 className="page-title">Goal not found</h1><p className="state">This goal does not exist or you do not have access to it.</p><Link className="button outline small" to="/today">Back to Today</Link></div>;
  const { goal, projects, tasks, milestones } = state.data;
  const marked = new Set(milestones.map(item => item.task.id));
  const edit = () => { setTitle(goal.title); setDescription(goal.description ?? ""); setColor(goal.color); setEditing(true); };
  async function save(event: FormEvent) {
    event.preventDefault();
    try { await onSave({ title, description, color }); setEditing(false); } catch { /* shown through write.error */ }
  }
  return <div className="goal-page" data-goal-id={goal.id}>
    <div className="project-header">
      <h1 className="page-title goal-title"><GoalDot color={goal.color} />{goal.title}</h1>
      <div className="project-actions">
        {!goal.archived && <button type="button" className="button outline small" data-goal-action="edit" aria-expanded={editing} onClick={() => editing ? setEditing(false) : edit()}><Pencil />Edit</button>}
        <button type="button" className="button ghost small" disabled={write.pending} onClick={() => onArchive(!goal.archived)}>{goal.archived ? "Restore" : "Archive"}</button>
      </div>
    </div>
    {goal.archived && <p className="state" role="status">This goal is archived. It is hidden from the sidebar and keeps its data.</p>}
    {editing ? <form ref={releaseFocus} className="goal-edit" onSubmit={save} onKeyDown={(event) => { if (event.key === "Escape") setEditing(false); }}>
      <label>Title<input value={title} onChange={event => setTitle(event.target.value)} required maxLength={200} /></label>
      <label>Description<textarea value={description} onChange={event => setDescription(event.target.value)} rows={4} maxLength={10_000} placeholder="Why this goal matters and what reaching it looks like" /></label>
      <ColorPicker value={color} onChange={setColor} />
      <div className="project-actions">
        <button type="submit" className="button" disabled={write.pending || !title.trim()}>Save goal</button>
        <button type="button" className="button outline" onClick={() => setEditing(false)}>Cancel</button>
      </div>
    </form> : goal.description ? <p className="goal-description">{goal.description}</p>
      : !goal.archived && <button type="button" className="sheet-add goal-describe" onClick={edit}><Plus />Add a description</button>}
    {write.error && <p className="form-error" role="alert">{write.error}</p>}
    {season && <section className="goal-season" aria-label="This season">
      <CalendarRange aria-hidden="true" />
      <div className="goal-season-body">
        <p className="goal-season-head">This season · {season.tier === "primary" ? "Primary" : "Secondary"}</p>
        <p className="season-target"><span className="target-label">Target</span>{season.target}</p>
      </div>
      <Link className="button outline small" to="/season">Season</Link>
    </section>}
    <section className="goal-links" aria-label="Milestones">
      <h2 className="section-heading">Milestones</h2>
      {milestones.length ? <ol className="goal-link-list milestones">{milestones.map(({ task, criteria, reached }) => <li key={task.id} data-done={reached || undefined}>
        <Link to={taskPath(task.id)}>{task.title}<MilestoneMark /></Link>
        <span className="milestone-progress" aria-label={reached ? "Reached" : `${criteriaProgress(criteria)} done criteria ticked`}>{reached ? "Reached" : criteria.length ? criteriaProgress(criteria) : "No criteria"}</span>
      </li>)}</ol> : <p className="state">No milestones. Turn on Milestone in a linked task's details.</p>}
    </section>
    <section className="goal-links" aria-label="Linked projects">
      <h2 className="section-heading">Projects</h2>
      {projects.length ? <ul className="goal-link-list">{projects.map(project => <li key={project.id}>
        <Link to={`/projects/${encodeURIComponent(project.id)}`}><Hash />{project.name}</Link>
        <button type="button" className="icon-button row-delete" aria-label={`Unlink ${project.name}`} title="Unlink" disabled={write.pending} onClick={() => onUnlink("projects", project.id)}><X /></button>
      </li>)}</ul> : <p className="state">No linked projects. Link one from its project page.</p>}
    </section>
    <section className="goal-links" aria-label="Linked tasks">
      <h2 className="section-heading">Tasks</h2>
      {tasks.length ? <ul className="goal-link-list">{tasks.map(task => <li key={task.id} data-done={task.status === "done" || undefined}>
        <Link to={taskPath(task.id)}>{task.title}{marked.has(task.id) && <MilestoneMark />}</Link>
        <button type="button" className="icon-button row-delete" aria-label={`Unlink ${task.title}`} title="Unlink" disabled={write.pending} onClick={() => onUnlink("tasks", task.id)}><X /></button>
      </li>)}</ul> : <p className="state">No linked tasks. Link one from its task details.</p>}
    </section>
  </div>;
}
