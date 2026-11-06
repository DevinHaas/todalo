import { useState, type FormEvent } from "react";
import { Link, NavLink } from "react-router";
import { Plus, Target } from "lucide-react";
import type { GoalDto, GoalPatch } from "./goals";
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
    <SortableTasks ids={goals.map(goal => goal.id)} label={(id) => goals.find(goal => goal.id === id)?.title ?? "goal"} onReorder={onReorder}>
      {goals.map(goal => <SortableRow key={goal.id} id={goal.id} title={goal.title}>
        <NavLink to={`/goals/${encodeURIComponent(goal.id)}`} className="nav-item"><Target /><span>{goal.title}</span></NavLink>
      </SortableRow>)}
    </SortableTasks>
  </section>;
}

/** A goal's page: title and description, edited in place; archiving keeps its data. */
export function GoalView({ state, onRetry, onSave, onArchive, write }: {
  state: ReadState<GoalDto | null>; onRetry: () => void; onSave: (patch: GoalPatch) => Promise<unknown>; onArchive: (archived: boolean) => void; write: Write;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  if (state.status === "pending") return <p className="state" role="status">Loading goal…</p>;
  if (state.status === "error") return <Failure error={state.error} onRetry={onRetry} />;
  if (!state.data) return <div><h1 className="page-title">Goal not found</h1><p className="state">This goal does not exist or you do not have access to it.</p><Link className="text-action" to="/today">Back to Today</Link></div>;
  const goal = state.data;
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
  </div>;
}
