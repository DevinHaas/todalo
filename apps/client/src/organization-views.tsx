import { useState, type FormEvent, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { parentCandidates, type DestinationsDto, type OrganizationChange, type SectionDto } from "./organization";
import { treeOrder, type TaskDto } from "./tasks";
import { Failure, type ReadState } from "./views";
import { releaseFocus } from "./software-keyboard";

// Pure views for ticket 13 (no runtime imports). The legacy client offered
// move/nest/unnest only as keyboard commands (v, Ctrl+], Ctrl+[); these are the
// touch-accessible buttons for the same operations. Shortcuts are ticket 19.

type Submit = (change: OrganizationChange) => Promise<unknown>;
const message = (reason: unknown) => reason instanceof Error ? reason.message : "Your changes could not be saved. Try again.";

/** Task page actions: Move task (legacy dialog), Nest task, Unnest task. */
export function TaskOrganizer({ task, tasks, destinations, onRetryDestinations, onOrganize }: {
  task: TaskDto;
  /** The user's tasks (parents and sub-tasks), or undefined while loading. */
  tasks?: TaskDto[];
  destinations: ReadState<DestinationsDto>;
  onRetryDestinations: () => void;
  onOrganize: Submit;
}) {
  const [open, setOpen] = useState<"move" | "nest" | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parent = task.parentId ? tasks?.find(item => item.id === task.parentId) : undefined;
  async function run(change: OrganizationChange) {
    setPending(true); setError(null);
    try { await onOrganize(change); setOpen(null); } catch (reason) { setError(message(reason)); } finally { setPending(false); }
  }
  return <section className="organizer" aria-label="Organize task">
    {task.parentId && <p>Sub-task of {parent?.title ?? "another task"}</p>}
    {error && !open && <p role="alert" className="form-error">{error}</p>}
    <div className="task-actions">
      <button type="button" className="button outline" disabled={pending} onClick={() => { setError(null); setOpen("move"); }}>Move task</button>
      {task.parentId
        ? <button type="button" className="button outline" disabled={pending} onClick={() => void run({ parentId: null })}>Unnest task</button>
        : <button type="button" className="button outline" disabled={pending} onClick={() => { setError(null); setOpen("nest"); }}>Nest task</button>}
    </div>
    {open === "move" && <MoveDialog task={task} destinations={destinations} onRetry={onRetryDestinations} pending={pending} error={error} onSubmit={run} onClose={() => setOpen(null)} />}
    {open === "nest" && <NestDialog task={task} tasks={tasks} pending={pending} error={error} onSubmit={run} onClose={() => setOpen(null)} />}
  </section>;
}

function Dialog({ title, pending, onClose, children }: { title: string; pending: boolean; onClose: () => void; children: ReactNode }) {
  return <div className="dialog-backdrop" onClick={(event) => { if (event.target === event.currentTarget && !pending) onClose(); }} onKeyDown={(event) => { if (event.key === "Escape" && !pending) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-label={title} className="dialog task-editor">
      <h2 className="dialog-title">{title}</h2>
      {children}
    </div>
  </div>;
}

/** Legacy "Move task" dialog; ticket 15's bulk move opens it from the first selected task with `count`. */
export function MoveDialog({ task, destinations, onRetry, pending, error, onSubmit, onClose, count = 1 }: {
  task: TaskDto; destinations: ReadState<DestinationsDto>; onRetry: () => void; pending: boolean; error: string | null; onSubmit: Submit; onClose: () => void; count?: number;
}) {
  const [projectId, setProjectId] = useState(task.projectId ?? "");
  const [sectionId, setSectionId] = useState(task.sectionId ?? "");
  const submit = (event: FormEvent) => { event.preventDefault(); void onSubmit({ projectId: projectId || null, sectionId: projectId && sectionId || null }); };
  const data = destinations.data;
  return <Dialog title="Move task" pending={pending} onClose={onClose}>
    {error && <p role="alert" className="form-error">{error}</p>}
    {!data
      ? destinations.status === "error" ? <Failure error={destinations.error} onRetry={onRetry} /> : <p role="status" className="state">Loading destinations…</p>
      : <form ref={releaseFocus} onSubmit={submit}><fieldset disabled={pending}>
        <label>Project<select aria-label="Move to project" value={projectId} onChange={(event) => { setProjectId(event.target.value); setSectionId(""); }}>
          <option value="">Inbox</option>
          {data.projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select></label>
        {projectId && <label>Section<select aria-label="Move to section" value={sectionId} onChange={(event) => setSectionId(event.target.value)}>
          <option value="">No section</option>
          {data.sections.filter(section => section.projectId === projectId).map(section => <option key={section.id} value={section.id}>{section.name}</option>)}
        </select></label>}
        <div className="composer-actions">
          <button type="button" className="button outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="button">{pending ? "Moving…" : `Move task${count > 1 ? "s" : ""}`}</button>
        </div>
      </fieldset></form>}
  </Dialog>;
}

function NestDialog({ task, tasks, pending, error, onSubmit, onClose }: {
  task: TaskDto; tasks?: TaskDto[]; pending: boolean; error: string | null; onSubmit: Submit; onClose: () => void;
}) {
  const candidates = tasks ? parentCandidates(task, tasks) : [];
  const [parentId, setParentId] = useState("");
  const hasChildren = tasks?.some(item => item.parentId === task.id);
  return <Dialog title="Nest task" pending={pending} onClose={onClose}>
    {error && <p role="alert" className="form-error">{error}</p>}
    {!tasks ? <p role="status" className="state">Loading tasks…</p>
      : hasChildren ? <p className="state">A task with sub-tasks cannot become a sub-task.</p>
      : candidates.length === 0 ? <p className="state">There is no other open task here to nest under.</p>
      : <form ref={releaseFocus} onSubmit={(event) => { event.preventDefault(); if (parentId) void onSubmit({ parentId }); }}><fieldset disabled={pending}>
        <label>Parent task<select aria-label="Parent task" value={parentId} onChange={(event) => setParentId(event.target.value)}>
          <option value="" disabled>Choose a task</option>
          {candidates.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.title}</option>)}
        </select></label>
        <div className="composer-actions">
          <button type="button" className="button outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="button" disabled={!parentId}>{pending ? "Nesting…" : "Nest task"}</button>
        </div>
      </fieldset></form>}
    {(!tasks || hasChildren || candidates.length === 0) && <div className="composer-actions"><button type="button" className="button outline" onClick={onClose}>Close</button></div>}
  </Dialog>;
}

/** Legacy "Create section" (inline here instead of a dialog, like the project rename). */
export function SectionComposer({ onCreate, onClose, pending }: { onCreate: (name: string) => Promise<unknown>; onClose: () => void; pending: boolean }) {
  const [name, setName] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    try { await onCreate(name); setName(""); onClose(); } catch { /* shown through the screen's write error */ }
  }
  return <form ref={releaseFocus} className="inline-form" aria-label="Create section" onSubmit={submit} onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}>
    <input autoFocus aria-label="Section name" placeholder="Section name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={200} />
    <button type="submit" className="button" disabled={pending || !name.trim()}>Create section</button>
    <button type="button" className="button outline" onClick={onClose}>Cancel</button>
  </form>;
}

/**
 * Legacy ProjectView groups: unsectioned "Tasks" first, then each section in
 * server order with a collapse toggle and Delete section (its tasks stay in the
 * project). A task whose section is unknown falls back to "Tasks".
 */
export function sectionGroups(sections: SectionDto[], tasks: TaskDto[]) {
  const known = new Set(sections.map(section => section.id));
  const groupOf = (task: TaskDto) => task.sectionId && known.has(task.sectionId) ? task.sectionId : null;
  return [{ section: null, tasks: treeOrder(tasks.filter(task => groupOf(task) === null)) },
    ...sections.map(section => ({ section, tasks: treeOrder(tasks.filter(task => groupOf(task) === section.id)) }))];
}

export function SectionHeader({ section, collapsed, onToggle, onDelete, pending }: { section: SectionDto; collapsed: boolean; onToggle: () => void; onDelete: () => void; pending: boolean }) {
  return <div className="section-header">
    <button type="button" className="section-toggle" aria-expanded={!collapsed} onClick={onToggle}><ChevronDown className={collapsed ? "closed" : ""} />{section.name}</button>
    <button type="button" className="text-action" disabled={pending} onClick={onDelete}>Delete section</button>
  </div>;
}
