import { Fragment, useCallback, useContext, useEffect, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { Link, useInRouterContext } from "react-router";
import {
  CalendarDays, ChevronDown, ChevronRight, ChevronUp, Circle as CircleIcon, CircleCheck, Ellipsis, Flag, GitBranch, Goal, Hash, Inbox, Plus, Repeat, Tag, TextAlignStart, Trash2, X,
} from "lucide-react";
import { MAX_SUBTASK_DEPTH } from "../../../packages/db/src/task-parent-validation";
import type { CommentDto } from "../../../packages/server/src/comment-dto";
import {
  dateInputValue, deadlineLabel, localInstant, repeatChoice, repeatLabel, repeatPresets, shortDateLabel, timeInputValue,
  type NewTask, type RecurrenceDto, type RepeatChoice, type TaskDetails, type TaskDto,
} from "./tasks";
import { AccountTransportError } from "./errors";
import { releaseFocus } from "./software-keyboard";
import { copyText, taskPath } from "./links";
import { Calendar, Dropdown, Popover, type Option } from "./popover";
import { Composer, ComposerChoices, priorityOptions } from "./composer";
import { ancestorsOf, subtaskRows, subtasksOf, TaskTree } from "./task-tree";
import { GoalPicker, GoalSuggestion, type GoalSlots } from "./goal-views";

type ReadState<T> = { status: "pending" | "error" | "success"; data?: T; error: Error | null };

type Draft = { title: string; description: string; priority: number; deadline: string; date: string; start: string; end: string; recurrence: RecurrenceDto | null; labelIds: string[] };
const draftOf = (task: TaskDto): Draft => ({
  title: task.title, description: task.description ?? "", priority: task.priority, deadline: dateInputValue(task.deadline),
  date: dateInputValue(task.dueDate), start: timeInputValue(task.dueDate), end: timeInputValue(task.dueDateEnd, false), recurrence: task.recurrence,
  labelIds: task.labelIds,
});
const repeatNames: Record<Exclude<RepeatChoice, "custom">, string> = { none: "Does not repeat", daily: "Daily", weekly: "Weekly", monthly: "Monthly" };
const repeatOptions: Option<RepeatChoice>[] = (Object.keys(repeatNames) as (keyof typeof repeatNames)[]).map(value => ({ value, label: repeatNames[value] }));
/** A picked calendar day (local midnight) as the `<input type="date">` value the draft keeps. */
const dayValue = (date: Date) => dateInputValue(date.toISOString());

/** The comments section's data and writes (comments.ts through task-sheet-screen). */
export interface CommentSlots {
  state: ReadState<CommentDto[] | null>;
  onRetry(): void;
  /** The signed-in user, for the composer's avatar. */
  author: { name: string; image: string | null };
  add(body: string): Promise<unknown>;
  remove(comment: CommentDto): void;
  error?: string | null;
}

/**
 * The task sheet (task-detail-redesign 04): breadcrumb header, title and
 * description, sub-tasks and comments, and a property sidebar. Text and
 * properties edit a draft saved with the version it was opened from; a pristine
 * draft follows newer copies of the task, a dirty one is never replaced
 * silently — if another device changed the task, saving fails with
 * TASK_CHANGED and the user loads the current details or keeps the draft
 * (ticket 22). Moves, sub-tasks and comments save at once (they are not draft
 * fields). With `labels` (the user's list) labels are editable; without it they
 * are kept. Keyboard commands press its controls (`.task-editor .sheet-form`,
 * `data-field`, `data-navigate`, `data-insert`, the submit button).
 */
export function TaskEditor({ task, labels, shareUrl, onSave, onClose, onInsert, navigation, onComplete, onRemove, onMove, onOpen, onAddSubtask, comments, goals }: {
  task: TaskDto; labels?: { id: string; name: string }[];
  /** The resolved https task link (ticket 18); "Copy link" shows once known. */
  shareUrl?: string;
  onSave: (details: TaskDetails) => Promise<unknown>; onClose: () => void;
  /** Save and add above/below: called once the save succeeds. */
  onInsert?: (edge: "above" | "below") => void;
  /** Previous/Next: save, then open the adjacent task of the list it was opened from. */
  navigation?: { previous: boolean; next: boolean; go(step: -1 | 1): void };
  /** The completion circles (this task and its sub-tasks). */
  onComplete?: (task: TaskDto) => void;
  onRemove?: () => void;
  /** Project picker: resolves with the moved copy (the draft keeps its text). */
  onMove?: (projectId: string | null) => Promise<TaskDto>;
  /** Opens a sub-task or parent in the sheet. */
  onOpen?: (id: string) => void;
  onAddSubtask?: (task: NewTask) => Promise<unknown>;
  comments?: CommentSlots;
  /** Goals ticket 02: links save at once (not a draft field); absent while Goals is hidden. */
  goals?: GoalSlots;
}) {
  const tree = useContext(TaskTree);
  const { projects } = useContext(ComposerChoices);
  const routed = useInRouterContext();
  const [base, setBase] = useState(task);
  const [draft, setDraft] = useState(() => draftOf(task));
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [copied, setCopied] = useState(false);
  const [writing, setWriting] = useState(false);
  const textChanged = draft.title !== base.title || draft.description !== (base.description ?? "");
  const load = (copy: TaskDto) => { setBase(copy); setDraft(draftOf(copy)); setDirty(false); setError(null); };
  useEffect(() => { if (!dirty && task.updatedAt !== base.updatedAt) load(task); }, [task, dirty, base.updatedAt]);
  const edit = (change: Partial<Draft>) => { setDraft(current => ({ ...current, ...change })); setDirty(true); };
  const changed = error instanceof AccountTransportError && error.code === "TASK_CHANGED";

  async function save(after?: "above" | "below" | -1 | 1) {
    if (!draft.title.trim() || pending) return false;
    setPending(true); setError(null);
    try {
      await onSave({
        updatedAt: base.updatedAt ?? "", title: draft.title.trim(), description: draft.description, priority: draft.priority,
        deadline: draft.deadline ? localInstant(draft.deadline) : null,
        dueDate: draft.date ? localInstant(draft.date, draft.start) : null,
        dueDateEnd: draft.date && draft.end ? localInstant(draft.date, draft.end) : null,
        recurrence: draft.recurrence,
        ...(labels && { labelIds: draft.labelIds.filter(id => labels.some(label => label.id === id)) }),
      });
      if (after === "above" || after === "below") onInsert?.(after);
      else if (after) navigation?.go(after);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason : new Error("Your changes could not be saved. Try again."));
      return false;
    } finally { setPending(false); }
  }
  /** Another task in the sheet: a draft is saved first, never dropped. */
  const openOther = onOpen ? async (id: string) => { if (!dirty || await save()) onOpen(id); } : undefined;
  async function move(projectId: string | null) {
    if (!onMove || projectId === task.projectId) return;
    setError(null);
    // The move changes the version, not the draft's fields: rebase so a later save is not refused.
    try { const moved = await onMove(projectId); setBase(current => ({ ...current, ...moved })); if (!dirty) setDraft(draftOf(moved)); }
    catch (reason) { setError(reason instanceof Error ? reason : new Error("The task could not be moved. Try again.")); }
  }

  const ancestors = ancestorsOf(task, tree);
  const parent = ancestors.at(-1);
  const projectName = task.projectId ? projects?.find(project => project.id === task.projectId)?.name ?? "Project" : "Inbox";
  const collection = task.projectId ? `/projects/${encodeURIComponent(task.projectId)}` : "/inbox";
  const projectIcon = task.projectId ? <Hash /> : <Inbox />;
  const focusSheet = useCallback((element: HTMLDivElement | null) => { if (element && !element.contains(document.activeElement)) element.focus({ preventScroll: true }); }, []);

  return <div className="dialog-backdrop task-sheet-backdrop" onClick={(event) => { if (event.target === event.currentTarget && !pending) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-labelledby="task-editor-title" className="dialog task-editor task-sheet" tabIndex={-1} ref={focusSheet}
      // On the dialog, so Escape closes it with focus anywhere in it (popovers and the quick add stop their own).
      onKeyDown={(event) => { if (event.key === "Escape" && !pending) onClose(); }}>
      {/* Not a <form>: the sub-task quick add is one, and a nested form's submit never reaches React (WebKit). */}
      <div ref={releaseFocus} className="sheet-form">
        <header className="sheet-header">
          <nav className="sheet-crumbs" aria-label="Task location">
            {routed ? <Link to={collection} onClick={onClose}>{projectIcon}<span>{projectName}</span></Link> : <span>{projectIcon}<span>{projectName}</span></span>}
            {ancestors.map(parent => <Fragment key={parent.id}><span aria-hidden="true">/</span>
              {openOther ? <button type="button" onClick={() => void openOther(parent.id)}>{parent.title}</button> : <span>{parent.title}</span>}
            </Fragment>)}
          </nav>
          <h2 id="task-editor-title" className="sr-only">{base.title}</h2>
          <div className="sheet-tools">
            {navigation && <>
              <button type="button" className="icon-button" data-navigate="-1" aria-label="Previous task" title="Previous task" disabled={pending || !navigation.previous || !draft.title.trim()} onClick={() => void save(-1)}><ChevronUp /></button>
              <button type="button" className="icon-button" data-navigate="1" aria-label="Next task" title="Next task" disabled={pending || !navigation.next || !draft.title.trim()} onClick={() => void save(1)}><ChevronDown /></button>
            </>}
            {(shareUrl || onInsert || onRemove) && <Popover label="More actions" role="menu" triggerClassName="icon-button" trigger={<Ellipsis />}>
              {close => <>
                {shareUrl && <Link role="menuitem" className="popover-item" to={taskPath(base.id)} onClick={() => { close(false); onClose(); }}>Task link</Link>}
                {shareUrl && <button type="button" role="menuitem" className="popover-item" onClick={() => { copyText(shareUrl).then(() => setCopied(true), (reason: Error) => setError(reason)); close(); }}>Copy link</button>}
                {onInsert && <>
                  <button type="button" role="menuitem" className="popover-item" disabled={!draft.title.trim()} onClick={() => { close(false); void save("above"); }}>Save and add task above</button>
                  <button type="button" role="menuitem" className="popover-item" disabled={!draft.title.trim()} onClick={() => { close(false); void save("below"); }}>Save and add task below</button>
                </>}
                {onRemove && <button type="button" role="menuitem" className="popover-item destructive" onClick={() => { close(false); onRemove(); }}><Trash2 />Delete task</button>}
              </>}
            </Popover>}
            <button type="button" className="icon-button" aria-label="Close" title="Close" disabled={pending} onClick={onClose}><X /></button>
          </div>
        </header>
        {/* Keyboard targets (Save and add) without a visible duplicate; the … menu offers them to pointers. */}
        {onInsert && <div hidden>
          <button type="button" data-insert="above" disabled={pending || !draft.title.trim()} onClick={() => void save("above")}>Save and add above</button>
          <button type="button" data-insert="below" disabled={pending || !draft.title.trim()} onClick={() => void save("below")}>Save and add below</button>
        </div>}
        {(error || copied) && <div className="sheet-notice">
          {error && <p role="alert" className="form-error">{error.message}{changed && (task.updatedAt === base.updatedAt ? " Loading current details…" : <>
            {" "}<button type="button" className="text-action" onClick={() => load(task)}>Load current details</button>
            {" "}<button type="button" className="text-action" onClick={() => { setBase(task); setError(null); }}>Keep my changes</button>
          </>)}</p>}
          {copied && <p role="status">Task link copied.</p>}
        </div>}
        <fieldset className="sheet-body" disabled={pending}>
          <div className="sheet-main">
            {parent && <ParentChip parent={parent} tree={tree} onOpen={openOther} />}
            <div className="sheet-title-row">
              <Circle task={task} onComplete={onComplete} />
              {/* Title and description edit in one bordered box (focused or changed), like ⌘E's quick add. */}
              <div className="sheet-text" data-editing={writing || undefined} onFocus={() => setWriting(true)}
                onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setWriting(textChanged); }}>
                <AutoGrow className="sheet-title" aria-label="Task name" value={draft.title} enterKeyHint="done"
                  onEnter={() => void save()} onChange={(title) => edit({ title: title.replace(/\n/g, " ") })} />
                <label className="sheet-description"><TextAlignStart aria-hidden="true" />
                  <AutoGrow aria-label="Description" placeholder="Description" value={draft.description} onChange={(description) => edit({ description })} />
                </label>
              </div>
            </div>
            <div className="sheet-actions" hidden={!dirty && !writing}>
              <button type="button" className="button outline" onClick={() => { load(task); setWriting(false); }}>Cancel</button>
              <button type="button" className="button" data-save disabled={!draft.title.trim()} onClick={() => void save()}>{pending ? "Saving…" : "Save"}</button>
            </div>
            <Subtasks task={task} tree={tree} onComplete={onComplete} onOpen={openOther} onAdd={ancestors.length < MAX_SUBTASK_DEPTH ? onAddSubtask : undefined} />
            {comments && <Comments task={task} slots={comments} />}
          </div>
          <aside className="sheet-side" aria-label="Task properties" data-dimmed={writing || undefined}>
            <Property label="Project">
              {onMove
                ? <Dropdown label="Project" value={task.projectId ?? ""} className="property-value" chevron={false} data={{ "data-field": "project" }}
                  options={[{ value: "", label: "Inbox", icon: <Inbox /> }, ...(projects ?? []).map(project => ({ value: project.id, label: project.name, icon: <Hash /> }))]}
                  onChange={(value) => void move(value || null)} />
                : <span className="property-value">{projectIcon}<span>{projectName}</span></span>}
            </Property>
            <DateProperty draft={draft} edit={edit} />
            <Property label="Deadline" add={!draft.deadline}>
              <Popover label={draft.deadline ? `Deadline: ${deadlineLabel(localInstant(draft.deadline))}` : "Add deadline"} triggerClassName={draft.deadline ? "property-value" : "icon-button property-add"} data={{ "data-field": "deadline" }}
                trigger={draft.deadline ? <><Goal /><span>{deadlineLabel(localInstant(draft.deadline))}</span></> : <Plus />}>
                {close => <div className="property-panel">
                  <Calendar selected={draft.deadline ? new Date(localInstant(draft.deadline)) : undefined} onSelect={(date) => { edit({ deadline: dayValue(date) }); close(); }} />
                  {draft.deadline && <button type="button" className="text-action" onClick={() => { edit({ deadline: "" }); close(); }}>Clear deadline</button>}
                </div>}
              </Popover>
            </Property>
            <Property label="Priority">
              <Dropdown label="Priority" value={draft.priority} options={priorityOptions} className="property-value" chevron={false} data={{ "data-field": "priority" }}
                triggerContent={<><Flag data-priority={draft.priority} /><span>P{draft.priority}</span></>} onChange={(priority) => edit({ priority })} />
            </Property>
            {labels && (() => { const chosen = labels.filter(label => draft.labelIds.includes(label.id)); return <Property label="Labels" add={!chosen.length}>
              <Popover label={chosen.length ? `Labels: ${chosen.map(label => label.name).join(", ")}` : "Add labels"}
                triggerClassName={chosen.length ? "property-value" : "icon-button property-add"} data={{ "data-field": "labels" }}
                trigger={chosen.length ? <span className="label-chips">{chosen.map(label => <span key={label.id} className="label-chip"><Tag />{label.name}</span>)}</span> : <Plus />}>
                {() => <fieldset className="label-choices property-panel"><legend>Labels</legend>
                  {labels.length > 0 && <div className="label-options">{labels.map(label => <label key={label.id} className="label-option">
                    <input type="checkbox" checked={draft.labelIds.includes(label.id)} onChange={(event) => edit({ labelIds: event.target.checked ? [...draft.labelIds, label.id] : draft.labelIds.filter(id => id !== label.id) })} />{label.name}
                  </label>)}</div>}
                  {!labels.length && <p className="state">Create labels in <Link to="/labels" onClick={onClose}>Labels</Link>.</p>}
                </fieldset>}
              </Popover>
            </Property>; })()}
            {goals && <Property label="Goals" add={!goals.linked.some(id => goals.goals.some(goal => goal.id === id))}>
              <GoalPicker slots={goals} variant="property" data={{ "data-field": "goals" }} />
              <GoalSuggestion slots={goals} />
            </Property>}
          </aside>
        </fieldset>
      </div>
    </div>
  </div>;
}

/** A textarea that grows with its text; Enter calls `onEnter` when given (the title). */
function AutoGrow({ value, onChange, onEnter, className, ...rest }: { value: string; onChange(value: string): void; onEnter?: () => void; className?: string; placeholder?: string; "aria-label": string; enterKeyHint?: "done" }) {
  const grow = useCallback((element: HTMLTextAreaElement | null) => { if (element) { element.style.height = "auto"; element.style.height = `${element.scrollHeight}px`; } }, []);
  return <textarea ref={grow} rows={1} className={className} value={value} {...rest}
    onInput={(event) => grow(event.currentTarget)} onChange={(event) => onChange(event.target.value)}
    onKeyDown={onEnter ? (event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); onEnter(); } } : undefined} />;
}

/** A sub-task's parent above its title: status, title and the parent's sub-task count; opens the parent. */
function ParentChip({ parent, tree, onOpen }: { parent: TaskDto; tree: readonly TaskDto[] | null; onOpen?: (id: string) => void }) {
  const total = subtasksOf(parent.id, tree).total;
  return <button type="button" className="sheet-parent" disabled={!onOpen} aria-label={`Parent task: ${parent.title}, ${total} sub-tasks`} onClick={() => onOpen?.(parent.id)}>
    {parent.status === "done" ? <CircleCheck /> : <CircleIcon />}<span className="sheet-parent-title">{parent.title}</span>
    <span className="sheet-parent-count"><GitBranch />{total}<ChevronRight /></span>
  </button>;
}

function Circle({ task, onComplete }: { task: TaskDto; onComplete?: (task: TaskDto) => void }) {
  return onComplete
    ? <button type="button" role="checkbox" aria-checked={task.status === "done"} aria-label={`Complete ${task.title}`} className="checkbox" data-priority={task.priority} onClick={() => onComplete(task)} />
    : <span className="checkbox" data-priority={task.priority} aria-checked={task.status === "done"} aria-hidden="true" />;
}

function Property({ label, add, children }: { label: string; add?: boolean; children: ReactNode }) {
  return <div className={add ? "property empty" : "property"}><span className="property-label">{label}</span>{children}</div>;
}

function DateProperty({ draft, edit }: { draft: Draft; edit(change: Partial<Draft>): void }) {
  const choice = repeatChoice(draft.recurrence);
  const label = draft.date ? shortDateLabel({ dueDate: localInstant(draft.date, draft.start), dueDateEnd: draft.end ? localInstant(draft.date, draft.end) : null }) : "";
  return <Property label="Date" add={!draft.date}>
    <Popover label={draft.date ? `Date: ${label}` : "Add date"} triggerClassName={draft.date ? "property-value date" : "icon-button property-add"} data={{ "data-field": "date" }}
      trigger={draft.date ? <><CalendarDays /><span>{label}</span>{draft.recurrence && <Repeat aria-label={repeatLabel(draft.recurrence)} />}</> : <Plus />}>
      {close => <div className="property-panel">
        <Calendar selected={draft.date ? new Date(localInstant(draft.date)) : undefined} onSelect={(date) => edit({ date: dayValue(date) })} />
        {/* Shown once a date is set; leaving both empty keeps the task all-day. */}
        {draft.date && <div className="time-range">
          <input type="time" aria-label="Start time" value={draft.start} onChange={(event) => edit({ start: event.target.value })} />
          <span>to</span>
          <input type="time" aria-label="End time" value={draft.end} onChange={(event) => edit({ end: event.target.value })} />
        </div>}
        <div className="field">Repeat<Dropdown label="Repeat" value={choice} options={choice === "custom" && draft.recurrence ? [...repeatOptions, { value: "custom", label: repeatLabel(draft.recurrence) }] : repeatOptions} data={{ "data-field": "repeat" }}
          onChange={(value) => { if (value !== "custom") edit({ recurrence: value === "none" ? null : repeatPresets[value] }); }} /></div>
        {draft.date && <button type="button" className="text-action" onClick={() => { edit({ date: "", start: "", end: "" }); close(); }}>Clear date</button>}
      </div>}
    </Popover>
  </Property>;
}

/** A pie of done/total in a ring (the Sub-tasks header). */
function Progress({ done, total }: { done: number; total: number }) {
  const share = total ? done / total : 0;
  return <svg className="progress-ring" viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.25" />
    <circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" strokeWidth="6" pathLength="100" strokeDasharray={`${share * 100} 100`} transform="rotate(-90 8 8)" />
  </svg>;
}

function Subtasks({ task, tree, onComplete, onOpen, onAdd }: {
  task: TaskDto; tree: readonly TaskDto[] | null; onComplete?: (task: TaskDto) => void; onOpen?: (id: string) => void; onAdd?: (task: NewTask) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(true);
  const [hideDone, setHideDone] = useState(false);
  const [adding, setAdding] = useState(false);
  const direct = subtasksOf(task.id, tree);
  if (!direct.total && !onAdd) return null;
  const rows = subtaskRows(task.id, tree, hideDone);
  // Completed direct sub-tasks (with their own children) go below "Add sub-task".
  const split = rows.findIndex(row => row.depth === 0 && row.task.status === "done");
  const before = split < 0 ? rows : rows.slice(0, split), after = split < 0 ? [] : rows.slice(split);
  const row = ({ task: child, depth }: { task: TaskDto; depth: number }) => {
    const nested = subtasksOf(child.id, tree);
    return <div key={child.id} className="sheet-subtask" data-done={child.status === "done" || undefined} style={depth ? { "--depth": depth } as CSSProperties : undefined}>
      <Circle task={child} onComplete={onComplete} />
      {onOpen ? <button type="button" className="sheet-subtask-title" onClick={() => onOpen(child.id)}>{child.title}</button> : <span className="sheet-subtask-title">{child.title}</span>}
      {child.dueDate && <span className="pill due">{shortDateLabel(child)}</span>}
      {nested.total > 0 && <span className="pill" aria-label={`${nested.done.length} of ${nested.total} sub-tasks done`}><GitBranch />{nested.done.length}/{nested.total}</span>}
    </div>;
  };
  return <section className="sheet-section" aria-label="Sub-tasks">
    <div className="sheet-section-header">
      <button type="button" className="section-toggle" aria-expanded={open} onClick={() => setOpen(value => !value)}>
        <ChevronDown className={open ? "" : "closed"} />Sub-tasks
      </button>
      {direct.total > 0 && <span className="subtask-progress" aria-label={`${direct.done.length} of ${direct.total} done`}><Progress done={direct.done.length} total={direct.total} />{direct.done.length}/{direct.total}</span>}
      {direct.done.length > 0 && <button type="button" className="hide-completed" aria-pressed={hideDone} onClick={() => setHideDone(value => !value)}>{hideDone ? "Show completed" : "Hide completed"}</button>}
    </div>
    {open && <div className="sheet-subtasks">
      {before.map(row)}
      {onAdd && (adding ? <div className="dialog quick-add inline-quick-add">
        <Composer startOpen quick parentId={task.id} projectId={task.projectId} sectionId={task.sectionId} dueDate={() => null} onCancel={() => setAdding(false)} onCreate={onAdd} />
      </div>
        : <button type="button" className="sheet-add" onClick={() => setAdding(true)}><Plus />Add sub-task</button>)}
      {after.map(row)}
    </div>}
  </section>;
}

const commentTime = (value: string) => {
  const date = new Date(value);
  const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", ...(date.getFullYear() !== new Date().getFullYear() && { year: "numeric" }) }).format(date);
  return `${day} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};
/** Comment text with web links and Markdown links (`[text](url)`, as Todoist writes them) clickable. */
export function linkify(text: string): ReactNode[] {
  const pattern = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>"]+)/g;
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    parts.push(text.slice(last, match.index));
    const href = match[2] ?? match[3]!;
    parts.push(<a key={match.index} href={href} target="_blank" rel="noreferrer noopener">{match[1] ?? href}</a>);
    last = match.index + match[0].length;
  }
  parts.push(text.slice(last));
  return parts.filter(part => part !== "");
}
function Avatar({ author }: { author: { name: string; image: string | null } }) {
  return author.image ? <img className="avatar sheet-avatar" src={author.image} alt="" referrerPolicy="no-referrer" />
    : <span className="avatar sheet-avatar" aria-hidden="true">{author.name.slice(0, 1).toUpperCase() || "?"}</span>;
}

function Comments({ task, slots }: { task: TaskDto; slots: CommentSlots }) {
  const [open, setOpen] = useState(true);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const list = slots.state.data ?? [];
  const count = slots.state.data ? list.length : task.commentCount ?? 0;
  async function add() {
    if (!body.trim() || busy) return;
    setBusy(true);
    try { await slots.add(body.trim()); setBody(""); } catch { /* shown through slots.error; the text is kept */ } finally { setBusy(false); }
  }
  return <section className="sheet-section" aria-label="Comments">
    <div className="sheet-section-header">
      <button type="button" className="section-toggle" aria-expanded={open} onClick={() => setOpen(value => !value)}>
        <ChevronDown className={open ? "" : "closed"} />Comments{count > 0 && <span className="muted-count">{count}</span>}
      </button>
    </div>
    {open && <>
      {slots.state.status === "pending" && <p className="state" role="status">Loading comments…</p>}
      {slots.state.status === "error" && <p className="state"><span role="alert">{slots.state.error?.message ?? "Comments could not be loaded."}</span> <button type="button" className="text-action" onClick={slots.onRetry}>Try again</button></p>}
      {list.length > 0 && <ul className="comment-list">{list.map(comment => <li key={comment.id} className="comment">
        <Avatar author={comment.author} />
        <div className="comment-content">
          <p className="comment-head"><strong>{comment.author.name}</strong><time dateTime={comment.createdAt}>{commentTime(comment.createdAt)}</time>
            <button type="button" className="icon-button row-delete" aria-label="Delete comment" onClick={() => slots.remove(comment)}><X /></button></p>
          <p className="comment-body">{linkify(comment.body)}</p>
        </div>
      </li>)}</ul>}
      {slots.error && <p role="alert" className="form-error">{slots.error}</p>}
      <div className="comment-composer">
        <Avatar author={slots.author} />
        <AutoGrow aria-label="Comment" placeholder="Comment" value={body} onChange={setBody} onEnter={() => void add()} />
      </div>
    </>}
  </section>;
}
