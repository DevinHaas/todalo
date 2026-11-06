import { useState, type FormEvent } from "react";
import { Link, NavLink } from "react-router";
import { ArrowDown, ArrowUp, CalendarRange, Flag, Hash, Plus, Target, X } from "lucide-react";
import { criteriaProgress, moveCriterion, type CriterionDto, type GoalDetailDto, type GoalDto, type GoalLinkKind, type GoalPatch, type MilestoneDto } from "./goals";
import { taskPath } from "./links";
import { Popover } from "./popover";
import type { ReorderPosition } from "./bulk";
import { SortableRow, SortableTasks } from "./bulk-views";
import { Failure, type ReadState } from "./views";
import { releaseFocus } from "./software-keyboard";

// Pure goal views (goals ticket 01): no runtime imports.
type Write = { pending: boolean; error: string | null };

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
    {/* Goals ticket 04: hidden with Goals, like the rest of this section. */}
    <NavLink to="/season" className="nav-item"><CalendarRange /><span>Season</span></NavLink>
    <SortableTasks ids={goals.map(goal => goal.id)} label={(id) => goals.find(goal => goal.id === id)?.title ?? "goal"} onReorder={onReorder}>
      {goals.map(goal => <SortableRow key={goal.id} id={goal.id} title={goal.title}>
        <NavLink to={`/goals/${encodeURIComponent(goal.id)}`} className="nav-item"><Target /><span>{goal.title}</span></NavLink>
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
  const chips = <span className="label-chips">{chosen.map(goal => <span key={goal.id} className="label-chip"><Target />{goal.title}</span>)}</span>;
  return <>
    <Popover label={chosen.length ? `Goals: ${chosen.map(goal => goal.title).join(", ")}` : "Link goals"} data={data}
      triggerClassName={variant === "button" ? "button outline" : chosen.length ? "property-value" : "icon-button property-add"}
      trigger={variant === "button" ? <><Target />{chosen.length ? `Goals · ${chosen.length}` : "Goals"}</> : chosen.length ? chips : <Plus />}>
      {() => <fieldset className="label-choices property-panel"><legend>Goals</legend>
        {slots.goals.length > 0 && <div className="label-options">{slots.goals.map(goal => <label key={goal.id} className="label-option">
          <input type="checkbox" checked={slots.linked.includes(goal.id)} onChange={(event) => slots.onToggle(goal.id, event.target.checked)} />{goal.title}
        </label>)}</div>}
        {!slots.goals.length && <p className="state">Create a goal with + next to Goals in the sidebar.</p>}
      </fieldset>}
    </Popover>
    {slots.error && <p className="form-error" role="alert">{slots.error}</p>}
  </>;
}

/** Ticket 06: the task sheet's milestone, for one of the task's linked goals. Every change saves at once. */
export interface MilestoneSlots {
  /** The task's linked, active goals (a milestone needs a link). */
  goals: GoalDto[]; milestone: MilestoneDto | null; onChange(milestone: MilestoneDto | null): void; error: string | null;
}

/** One criterion: tick it, edit its text (saved on Enter or leaving the field), move it, remove it. */
function CriterionRow({ item, index, count, onChange, onMove, onRemove }: {
  item: CriterionDto; index: number; count: number; onChange(item: CriterionDto): void; onMove(by: -1 | 1): void; onRemove(): void;
}) {
  const [text, setText] = useState(item.text);
  const commit = () => { const trimmed = text.trim(); if (!trimmed) setText(item.text); else if (trimmed !== item.text) onChange({ ...item, text: trimmed }); };
  return <li className="criterion" data-done={item.done || undefined}>
    <input type="checkbox" aria-label={`Done: ${item.text}`} checked={item.done} onChange={(event) => onChange({ ...item, done: event.target.checked })} />
    <input aria-label={`Criterion ${index + 1}`} value={text} maxLength={500} onChange={(event) => setText(event.target.value)} onBlur={commit}
      onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commit(); } }} />
    <button type="button" className="icon-button" aria-label={`Move ${item.text} up`} disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp /></button>
    <button type="button" className="icon-button" aria-label={`Move ${item.text} down`} disabled={index === count - 1} onClick={() => onMove(1)}><ArrowDown /></button>
    <button type="button" className="icon-button" aria-label={`Remove ${item.text}`} onClick={onRemove}><X /></button>
  </li>;
}

/** The task sheet's Milestone property: which linked goal it is a milestone for, and its ordered done criteria. */
export function MilestoneField({ slots }: { slots: MilestoneSlots }) {
  const [adding, setAdding] = useState("");
  const { milestone, goals } = slots;
  const goal = milestone && goals.find(item => item.id === milestone.goalId);
  const criteria = milestone?.criteria ?? [];
  const save = (next: CriterionDto[]) => milestone && slots.onChange({ ...milestone, criteria: next });
  const add = (event: FormEvent) => { event.preventDefault(); if (!adding.trim()) return; save([...criteria, { text: adding.trim(), done: false }]); setAdding(""); };
  return <>
    <Popover label={goal ? `Milestone for ${goal.title}: ${criteriaProgress(criteria)} done criteria ticked` : "Make milestone"} data={{ "data-field": "milestone" }}
      triggerClassName={goal ? "property-value" : "icon-button property-add"}
      trigger={goal ? <span className="label-chip"><Flag />{goal.title}{criteria.length > 0 && ` · ${criteriaProgress(criteria)}`}</span> : <Plus />}>
      {() => <div className="property-panel milestone-panel">
        <label>Milestone for
          <select value={milestone?.goalId ?? ""} onChange={(event) => slots.onChange(event.target.value ? { goalId: event.target.value, criteria } : null)}>
            <option value="">Not a milestone</option>
            {goals.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
        </label>
        {milestone && <>
          <p className="state">Done criteria · reached when all are ticked</p>
          {criteria.length > 0 && <ol className="criteria">{criteria.map((item, index) => <CriterionRow key={`${index}:${item.text}`} item={item} index={index} count={criteria.length}
            onChange={(changed) => save(criteria.map((other, at) => at === index ? changed : other))}
            onMove={(by) => save(moveCriterion(criteria, index, by))}
            onRemove={() => save(criteria.filter((_, at) => at !== index))} />)}</ol>}
          {criteria.length < 50 && <form className="inline-form" onSubmit={add}>
            <input aria-label="New done criterion" placeholder="Add done criterion" value={adding} maxLength={500} onChange={(event) => setAdding(event.target.value)} />
            <button type="submit" className="button small" disabled={!adding.trim()}>Add</button>
          </form>}
        </>}
      </div>}
    </Popover>
    {slots.error && <p className="form-error" role="alert">{slots.error}</p>}
  </>;
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

/** A goal's page: title and description, edited in place; archiving keeps its data. Lists its linked projects and tasks. */
export function GoalView({ state, onRetry, onSave, onArchive, onUnlink, write }: {
  state: ReadState<GoalDetailDto | null>; onRetry: () => void; onSave: (patch: GoalPatch) => Promise<unknown>; onArchive: (archived: boolean) => void;
  /** Removes only the link; the project or task stays. */
  onUnlink: (kind: GoalLinkKind, targetId: string) => void; write: Write;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  if (state.status === "pending") return <p className="state" role="status">Loading goal…</p>;
  if (state.status === "error") return <Failure error={state.error} onRetry={onRetry} />;
  if (!state.data) return <div><h1 className="page-title">Goal not found</h1><p className="state">This goal does not exist or you do not have access to it.</p><Link className="text-action" to="/today">Back to Today</Link></div>;
  const { goal, projects, tasks, milestones } = state.data;
  const edit = () => { setTitle(goal.title); setDescription(goal.description ?? ""); setEditing(true); };
  async function save(event: FormEvent) {
    event.preventDefault();
    try { await onSave({ title, description }); setEditing(false); } catch { /* shown through write.error */ }
  }
  return <div className="goal-page" data-goal-id={goal.id}>
    <div className="project-header">
      <h1 className="page-title">{goal.title}</h1>
      <div className="project-actions">
        {!goal.archived && <button type="button" className="button outline" data-goal-action="edit" aria-expanded={editing} onClick={() => editing ? setEditing(false) : edit()}>Edit goal</button>}
        <button type="button" className="button outline" disabled={write.pending} onClick={() => onArchive(!goal.archived)}>{goal.archived ? "Restore goal" : "Archive goal"}</button>
      </div>
    </div>
    {goal.archived && <p className="state" role="status">This goal is archived. It is hidden from the sidebar and keeps its data.</p>}
    {editing ? <form ref={releaseFocus} className="goal-edit" onSubmit={save} onKeyDown={(event) => { if (event.key === "Escape") setEditing(false); }}>
      <label>Title<input value={title} onChange={event => setTitle(event.target.value)} required maxLength={200} /></label>
      <label>Description<textarea value={description} onChange={event => setDescription(event.target.value)} rows={4} maxLength={10_000} placeholder="What does reaching this goal look like?" /></label>
      <div className="project-actions">
        <button type="submit" className="button" disabled={write.pending || !title.trim()}>Save goal</button>
        <button type="button" className="button outline" onClick={() => setEditing(false)}>Cancel</button>
      </div>
    </form> : goal.description ? <p className="goal-description">{goal.description}</p> : !goal.archived && <p className="state">No description yet. <button type="button" className="text-action" onClick={edit}>Add one</button></p>}
    {write.error && <p className="form-error" role="alert">{write.error}</p>}
    <section className="goal-links" aria-label="Milestones">
      <h2 className="section-heading">Milestones</h2>
      {milestones.length ? <ol className="goal-link-list milestones">{milestones.map(({ task, criteria, reached }) => <li key={task.id} data-done={reached || undefined}>
        <Link to={taskPath(task.id)}><Flag />{task.title}</Link>
        <span className="milestone-progress" aria-label={reached ? "Reached" : `${criteriaProgress(criteria)} done criteria ticked`}>{reached ? "Reached" : criteria.length ? criteriaProgress(criteria) : "No criteria"}</span>
      </li>)}</ol> : <p className="state">No milestones. Make a linked task a milestone from its task details.</p>}
    </section>
    <section className="goal-links" aria-label="Linked projects">
      <h2 className="section-heading">Projects</h2>
      {projects.length ? <ul className="goal-link-list">{projects.map(project => <li key={project.id}>
        <Link to={`/projects/${encodeURIComponent(project.id)}`}><Hash />{project.name}</Link>
        <button type="button" className="icon-button" aria-label={`Unlink ${project.name}`} title="Unlink" disabled={write.pending} onClick={() => onUnlink("projects", project.id)}><X /></button>
      </li>)}</ul> : <p className="state">No linked projects. Link one from its project page.</p>}
    </section>
    <section className="goal-links" aria-label="Linked tasks">
      <h2 className="section-heading">Tasks</h2>
      {tasks.length ? <ul className="goal-link-list">{tasks.map(task => <li key={task.id} data-done={task.status === "done" || undefined}>
        <Link to={taskPath(task.id)}>{task.title}</Link>
        <button type="button" className="icon-button" aria-label={`Unlink ${task.title}`} title="Unlink" disabled={write.pending} onClick={() => onUnlink("tasks", task.id)}><X /></button>
      </li>)}</ul> : <p className="state">No linked tasks. Link one from its task details.</p>}
    </section>
  </div>;
}
