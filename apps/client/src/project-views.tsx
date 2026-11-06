import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router";
import { Plus } from "lucide-react";
import { treeOrder, type NewTask, type TaskDto } from "./tasks";
import { Composer, Failure, listTree, TaskRow, type ReadState, type RowActions, type SelectionSlots } from "./views";
import { SortableRow, SortableTasks } from "./bulk-views";
import { reorderAnchor, type ReorderPosition } from "./bulk";
import { sortProjectTasks, type ProjectDetailDto, type ProjectDto, type ProjectSort } from "./projects";
import type { SectionDto } from "./organization";
import { SectionComposer, SectionHeader, sectionGroups } from "./organization-views";
import { releaseFocus } from "./software-keyboard";

// Pure screen views (legacy ProjectDirectory / ProjectView): no runtime imports.
type Write = { pending: boolean; error: string | null };

export function ProjectsView({ state, onRetry, onCreate, write }: { state: ReadState<ProjectDto[]>; onRetry: () => void; onCreate: (name: string) => Promise<unknown>; write: Write }) {
  const [name, setName] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    try { await onCreate(name); setName(""); } catch { /* shown through write.error */ }
  }
  let list;
  if (state.status === "pending") list = <p className="state" role="status">Loading projects…</p>;
  else if (state.status === "error" || !state.data) list = <Failure error={state.error} onRetry={onRetry} />;
  else list = <>
    {state.data.length > 0 && <ul className="project-list">{state.data.map(project => <li key={project.id}><Link to={`/projects/${encodeURIComponent(project.id)}`}>{project.name}</Link></li>)}</ul>}
    {state.data.length === 0 && <p className="state">Create a project to organize your tasks.</p>}
  </>;
  return <div className="directory">
    <h1 className="page-title">Projects</h1>
    <form className="inline-form" onSubmit={submit}>
      <input aria-label="New project name" placeholder="New project name" value={name} onChange={event => setName(event.target.value)} required maxLength={200} />
      <button type="submit" className="button" disabled={write.pending || !name.trim()}>Create project</button>
    </form>
    {write.error && <p className="form-error" role="alert">{write.error}</p>}
    {list}
  </div>;
}

/** Ticket 13 section writes; without them "Add section" stays the inert placeholder. */
export interface SectionActions { create(name: string): Promise<unknown>; remove(section: SectionDto): void }

export function ProjectView({ state, onRetry, onRename, onDelete, write, files, sections: sectionActions, now = new Date(), selection, reorder, layout, onCreate, initialSort = "manual", actions, showCompleted = false }: {
  state: ReadState<ProjectDetailDto | null>; onRetry: () => void; onRename: (name: string) => Promise<unknown>; onDelete: () => void; write: Write; files?: ReactNode;
  sections?: SectionActions; now?: Date;
  /** Ticket 15: selection and bulk toolbar, and drag/keyboard reordering within a section. */
  selection?: SelectionSlots; reorder?: (task: TaskDto, anchorId: string, position: ReorderPosition) => void;
  /** Ticket 17: Board or Calendar from Display, over every project task, in place of the section list. */
  layout?: (tasks: TaskDto[]) => ReactNode;
  /** Legacy per-section TaskComposer; without it "Add task" stays the inert placeholder. */
  onCreate?: (task: NewTask) => Promise<unknown>;
  initialSort?: ProjectSort;
  /** Row complete/delete (legacy TaskRow); without them rows keep the inert checkbox. */
  actions?: RowActions;
  /** Display's "Completed tasks" (legacy ProjectView showCompleted). */
  showCompleted?: boolean;
}) {
  const [sort, setSort] = useState<ProjectSort>(initialSort);
  const [menuOpen, setMenuOpen] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [adding, setAdding] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // Toggle nested (keyboard-screens.tsx) folds or unfolds every section, as legacy "todalo:toggle-sections".
  const sectionIds = (state.data?.sections ?? []).map(section => section.id).join(" ");
  useEffect(() => {
    const toggle = () => setCollapsed(current => current.size ? new Set() : new Set(sectionIds.split(" ").filter(Boolean)));
    window.addEventListener("todalo:toggle-sections", toggle);
    return () => window.removeEventListener("todalo:toggle-sections", toggle);
  }, [sectionIds]);
  if (state.status === "pending") return <p className="state" role="status">Loading project…</p>;
  if (state.status === "error") return <Failure error={state.error} onRetry={onRetry} />;
  if (!state.data) return <div><h1 className="page-title">Project not found</h1><p className="state">This project does not exist or you do not have access to it.</p><Link className="text-action" to="/projects">Back to Projects</Link></div>;
  const { project, tasks, sections = [] } = state.data;
  // Completed tasks show only when Display says so (legacy default hides them); server order is sortOrder.
  // Sub-tasks stay under their parents in every sort (legacy tree); only Manual allows reordering and nesting.
  const open = treeOrder(sortProjectTasks(tasks.filter(task => showCompleted || task.status !== "done"), sort));
  const manual = sort === "manual";
  const tree = listTree(open);
  const row = (task: TaskDto) => <TaskRow key={task.id} task={task} now={now} projectName={project.name} actions={actions} selection={selection?.row(task)} {...tree(task)} />;
  const toggle = (id: string) => setCollapsed(current => { const next = new Set(current); if (!next.delete(id)) next.add(id); return next; });
  async function rename(event: FormEvent) {
    event.preventDefault();
    try { await onRename(name ?? project.name); setMenuOpen(false); setName(null); } catch { /* shown through write.error */ }
  }
  return <div data-project-id={project.id}>
    <div className="project-header">
      <h1 className="page-title">{project.name}</h1>
      <div className="project-actions">
        {!layout && selection?.control}
        {sectionActions
          ? <button type="button" className="button outline" data-project-action="section" aria-expanded={adding} onClick={() => setAdding(value => !value)}>Add section</button>
          : <span className="button outline" aria-disabled="true">Add section</span>}
        <button type="button" className="button outline" data-project-action="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(value => !value)}>Project menu</button>
      </div>
    </div>
    <p className="page-count">{open.length} tasks</p>
    <label className="project-sort">Sort<select aria-label="Project sort" value={sort} onChange={event => setSort(event.target.value as ProjectSort)}>
      <option value="manual">Manual</option><option value="date">Date</option><option value="name">Name</option><option value="priority">Priority</option>
    </select></label>
    {menuOpen && <section className="project-menu" aria-label="Project menu">
      <form ref={releaseFocus} className="inline-form" onSubmit={rename}>
        <input aria-label="Project name" value={name ?? project.name} onChange={event => setName(event.target.value)} required maxLength={200} />
        <button type="submit" className="button" disabled={write.pending || !(name ?? project.name).trim()}>Save project name</button>
      </form>
      {/* In-page confirmation (legacy copy): native confirm() is not reliable in iOS WKWebView. */}
      {confirming ? <div className="confirm" role="group" aria-label="Confirm deletion">
        <p>Delete this project? Its tasks will move to Inbox.</p>
        <div className="project-actions">
          <button type="button" className="button destructive" disabled={write.pending} onClick={onDelete}>Delete</button>
          <button type="button" className="button outline" disabled={write.pending} onClick={() => setConfirming(false)}>Cancel</button>
        </div>
      </div> : <button type="button" className="button destructive" disabled={write.pending} onClick={() => setConfirming(true)}>Delete project</button>}
    </section>}
    {adding && sectionActions && <SectionComposer pending={write.pending} onCreate={sectionActions.create} onClose={() => setAdding(false)} />}
    {write.error && <p className="form-error" role="alert">{write.error}</p>}
    {!layout && selection?.toolbar}
    {files}
    {layout ? layout(sortProjectTasks(tasks, sort)) : <div className="sections">{sectionGroups(sections, open).map(({ section, tasks: grouped }) => <section key={section?.id ?? "root"} id={section ? `section-${section.id}` : undefined} tabIndex={section ? -1 : undefined}>
      {section
        ? <SectionHeader section={section} collapsed={collapsed.has(section.id)} onToggle={() => toggle(section.id)} pending={write.pending} onDelete={() => sectionActions?.remove(section)} />
        : <h2 className="section-heading">Tasks</h2>}
      {!(section && collapsed.has(section.id)) && <>
        {reorder && manual && grouped.length > 0
          ? <SortableTasks ids={grouped.map(task => task.id)} label={(id) => grouped.find(task => task.id === id)?.title ?? "task"} onReorder={(id, overId, position) => {
            const task = grouped.find(item => item.id === id); const anchorId = reorderAnchor(open, id, overId);
            if (task && anchorId) reorder(task, anchorId, position);
          }}>{grouped.map(task => <SortableRow key={task.id} id={task.id} title={task.title}>{row(task)}</SortableRow>)}</SortableTasks>
          : grouped.map(row)}
        {!section && open.length === 0 && <p className="state">No open tasks in this project.</p>}
        {onCreate
          ? <Composer dueDate={() => null} projectId={project.id} sectionId={section?.id ?? null} placement={{ edge: "bottom" }} onCreate={onCreate} />
          : <span className="composer" aria-disabled="true"><Plus />Add task</span>}
      </>}
    </section>)}</div>}
  </div>;
}
