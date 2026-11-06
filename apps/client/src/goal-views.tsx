import { useState, type FormEvent } from "react";
import { Link, NavLink } from "react-router";
import { CalendarRange, Hash, Plus, Target, X } from "lucide-react";
import type { GoalDetailDto, GoalDto, GoalLinkKind, GoalPatch } from "./goals";
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
  const { goal, projects, tasks } = state.data;
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
