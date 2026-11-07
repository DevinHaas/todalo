import { useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type Announcements, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { dateInputValue, localInstant, type TaskDto } from "./tasks";
import type { BulkCompletionDto, BulkMetadataChange, Destination, ReorderPosition } from "./bulk";
import type { DestinationsDto } from "./organization";
import { focusDialog, MoveDialog } from "./organization-views";
import type { ReadState } from "./views";
import { releaseFocus } from "./software-keyboard";
import { AccountTransportError } from "./errors";
import { inlineError, toasted } from "./toasts";

// Pure views for ticket 15 (no runtime imports). The legacy client selected
// tasks with X and acted on the selection from a toolbar (Complete, Delete,
// Priority, Labels, Deadline; Move and Clear date by shortcut). Touch has no X,
// so a Select button shows a checkbox per row; the toolbar adds Move and Clear
// date. Shortcuts (X, the toolbar focus key) press these same controls (keyboard-screens.tsx).

/** The selection of a task collection; IDs no longer shown drop out (legacy setVisible). */
export interface Selection {
  active: boolean;
  /** Selected IDs in display order. */
  ids: string[];
  has(id: string): boolean;
  toggle(id: string): void;
  start(): void;
  /** Leaves selection mode and clears it. */
  stop(): void;
  /** Removes IDs (after they were completed, deleted or moved away). */
  drop(ids: string[]): void;
}

export function useSelection(visible: string[]): Selection {
  const [active, setActive] = useState(false);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const ids = visible.filter(id => chosen.has(id));
  return {
    active: active || ids.length > 0, ids,
    has: (id) => ids.includes(id),
    toggle: (id) => setChosen(current => { const next = new Set(current); if (!next.delete(id)) next.add(id); return next; }),
    start: () => setActive(true),
    stop: () => { setActive(false); setChosen(new Set()); },
    drop: (removed) => setChosen(current => new Set([...current].filter(id => !removed.includes(id)))),
  };
}

/** The page header's Select / Done button. */
export function SelectionControl({ selection }: { selection: Selection }) {
  return selection.active
    ? <button type="button" className="button outline" data-selection-stop onClick={selection.stop}>Done</button>
    : <button type="button" className="button outline" data-selection-start onClick={selection.start}>Select</button>;
}

/** Bulk writes for a selection (bulkMutations behind the screen). */
export interface BulkActions {
  complete(tasks: TaskDto[]): Promise<BulkCompletionDto>;
  remove(tasks: TaskDto[]): Promise<unknown>;
  clearDates(tasks: TaskDto[]): Promise<unknown>;
  metadata(tasks: TaskDto[], change: BulkMetadataChange): Promise<unknown>;
  move(tasks: TaskDto[], destination: Destination): Promise<unknown>;
  /** The user's labels for the Labels picker (undefined while loading). */
  labels?: { id: string; name: string }[];
  destinations: ReadState<DestinationsDto>;
  onRetryDestinations(): void;
}

type Field = "priority" | "labels" | "deadline";
// A bulk 404 writes nothing: some selected task was deleted or moved out of reach meanwhile.
// A toasted failure (toasts.ts) is not repeated inline.
const message = (reason: unknown) => toasted(reason) ? null : reason instanceof AccountTransportError && reason.code === "TASK_NOT_FOUND"
  ? "Some selected tasks no longer exist. Nothing was changed; the list has been refreshed."
  : inlineError(reason);
const plural = (count: number) => `${count} task${count === 1 ? "" : "s"}`;

/**
 * Legacy "Selected task actions" toolbar. Shown while tasks are selected;
 * failures keep the selection so the action can be retried, and a completion
 * that skipped tasks changed elsewhere says so.
 */
export function SelectionToolbar({ selection, tasks, actions }: { selection: Selection; tasks: TaskDto[]; actions: BulkActions }) {
  const selected = selection.ids.map(id => tasks.find(task => task.id === id)).filter((task): task is TaskDto => Boolean(task));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ field: Field | "move"; tasks: TaskDto[] } | null>(null);
  async function run(action: () => Promise<unknown>, after?: (tasks: TaskDto[]) => void, targets = selected) {
    setPending(true); setError(null); setNotice(null);
    try { await action(); after?.(targets); setDialog(null); return true; }
    catch (reason) { setError(message(reason)); return false; }
    finally { setPending(false); }
  }
  const leave = (done: TaskDto[]) => selection.drop(done.map(task => task.id));
  async function complete() {
    let result: BulkCompletionDto | undefined;
    if (!await run(async () => { result = await actions.complete(selected); }, leave)) return;
    if (result?.changed.length) setNotice(`${plural(result.changed.length)} changed on another device and ${result.changed.length === 1 ? "was" : "were"} not completed.`);
  }
  if (!selected.length && !error && !notice) return selection.active ? <p className="selection-hint" role="status">Select tasks to act on them together.</p> : null;
  return <>
    {selected.length > 0 && <div role="toolbar" aria-label="Selected task actions" className="selection-toolbar">
      <span className="selection-count">{selected.length} selected</span>
      <button type="button" className="button small" disabled={pending} onClick={() => void complete()}>Complete</button>
      <button type="button" className="button small outline" disabled={pending} onClick={() => void run(() => actions.remove(selected), leave)}>Delete</button>
      <button type="button" className="button small outline" disabled={pending} data-bulk="priority" onClick={() => setDialog({ field: "priority", tasks: selected })}>Priority</button>
      <button type="button" className="button small outline" disabled={pending} data-bulk="labels" onClick={() => setDialog({ field: "labels", tasks: selected })}>Labels</button>
      <button type="button" className="button small outline" disabled={pending} data-bulk="deadline" onClick={() => setDialog({ field: "deadline", tasks: selected })}>Deadline</button>
      <button type="button" className="button small outline" disabled={pending} data-bulk="move" onClick={() => { setError(null); setDialog({ field: "move", tasks: selected }); }}>Move</button>
      <button type="button" className="button small outline" disabled={pending} onClick={() => void run(() => actions.clearDates(selected))}>Clear date</button>
      <button type="button" className="button small ghost" onClick={selection.stop}>Clear selection</button>
    </div>}
    {error && !dialog && <p role="alert" className="form-error">{error}</p>}
    {notice && <p role="status" className="selection-hint">{notice}</p>}
    {dialog?.field === "move" && <MoveDialog task={dialog.tasks[0]} count={dialog.tasks.length} destinations={actions.destinations} onRetry={actions.onRetryDestinations} pending={pending} error={error}
      onSubmit={(change) => "projectId" in change ? run(() => actions.move(dialog.tasks, change), leave, dialog.tasks) : Promise.resolve()} onClose={() => setDialog(null)} />}
    {dialog && dialog.field !== "move" && <MetadataDialog field={dialog.field} tasks={dialog.tasks} labels={actions.labels} pending={pending} error={error}
      onSave={(change) => run(() => actions.metadata(dialog.tasks, change), undefined, dialog.tasks)} onClose={() => setDialog(null)} />}
  </>;
}

const titles: Record<Field, string> = { priority: "Choose priority", labels: "Edit labels", deadline: "Choose deadline" };

/** Legacy bulk picker: one field, seeded from the first selected task; only that field is saved. */
function MetadataDialog({ field, tasks, labels, pending, error, onSave, onClose }: {
  field: Field; tasks: TaskDto[]; labels?: { id: string; name: string }[]; pending: boolean; error: string | null;
  onSave: (change: BulkMetadataChange) => Promise<unknown>; onClose: () => void;
}) {
  const first = tasks[0];
  const [priority, setPriority] = useState(first?.priority ?? 4);
  const [deadline, setDeadline] = useState(dateInputValue(first?.deadline ?? null));
  const [labelIds, setLabelIds] = useState(first?.labelIds ?? []);
  const title = `${titles[field]}${tasks.length > 1 ? ` for ${tasks.length} tasks` : ""}`;
  function submit(event: FormEvent) {
    event.preventDefault();
    if (pending || (field === "labels" && !labels)) return;
    void onSave(field === "priority" ? { priority } : field === "labels" ? { labelIds: labelIds.filter(id => labels!.some(label => label.id === id)) } : { deadline: deadline ? localInstant(deadline) : null });
  }
  return <div className="dialog-backdrop" onClick={(event) => { if (event.target === event.currentTarget && !pending) onClose(); }} onKeyDown={(event) => { if (event.key === "Escape" && !pending) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-label={title} className="dialog task-editor" tabIndex={-1} ref={focusDialog}>
      <h2 className="dialog-title">{title}</h2>
      {error && <p role="alert" className="form-error">{error}</p>}
      {field === "labels" && !labels ? <p role="status" className="state">Loading labels…</p> : <form ref={releaseFocus} onSubmit={submit}><fieldset disabled={pending}>
        {field === "priority" && <label>Priority<select autoFocus value={priority} onChange={(event) => setPriority(Number(event.target.value))}>
          {[1, 2, 3, 4].map(value => <option key={value} value={value}>Priority {value}{value === 1 ? " — highest" : value === 4 ? " — normal" : ""}</option>)}
        </select></label>}
        {field === "deadline" && <label>Deadline<input autoFocus type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} /></label>}
        {field === "labels" && labels && <fieldset className="label-choices"><legend>Labels</legend>
          {labels.length ? <div className="label-options">{labels.map(label => <label key={label.id} className="label-option">
            <input type="checkbox" checked={labelIds.includes(label.id)} onChange={(event) => setLabelIds(event.target.checked ? [...labelIds, label.id] : labelIds.filter(id => id !== label.id))} />{label.name}
          </label>)}</div> : <p className="state">You have no labels yet.</p>}
          {tasks.length > 1 && <p className="state">These labels replace the labels on every selected task.</p>}
        </fieldset>}
        <div className="composer-actions">
          <button type="button" className="button outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="button">{pending ? "Saving…" : "Save"}</button>
        </div>
      </fieldset></form>}
    </div>
  </div>;
}

/**
 * Drag-and-drop ordering for one list (legacy board used @dnd-kit with a 5 px
 * pointer threshold). Pointer events cover mouse and touch (WKWebView too);
 * the handle is a keyboard control: Space or Enter picks a row up, arrows move
 * it, Space drops, Escape cancels. `onReorder` gets the row placed before or
 * after the row it was dropped on. Reusable by board columns (ticket 17).
 */
export function SortableTasks({ ids, label, onReorder, children }: {
  ids: string[]; label: (id: string) => string; onReorder: (id: string, overId: string, position: ReorderPosition) => void; children: ReactNode;
}) {
  const sensors = useDragSensors();
  function end({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id)); const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onReorder(String(active.id), String(over.id), from < to ? "after" : "before");
  }
  return <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={end} accessibility={{ announcements: dragAnnouncements(label) }}>
    <SortableContext items={ids} strategy={verticalListSortingStrategy}>{children}</SortableContext>
  </DndContext>;
}

/** Shared by lists and the board: 5 px pointer threshold (mouse and touch), keyboard pick-up on the handle. */
export function useDragSensors() {
  return useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
}

/** Screen-reader announcements; `label` names a task or a board column by droppable ID. */
export function dragAnnouncements(label: (id: string) => string): Announcements {
  const name = (id: string | number) => label(String(id));
  return {
    onDragStart: ({ active }) => `Picked up ${name(active.id)}.`,
    onDragOver: ({ active, over }) => over ? `${name(active.id)} is over ${name(over.id)}.` : `${name(active.id)} is no longer over a task.`,
    onDragEnd: ({ active, over }) => over ? `${name(active.id)} was dropped at ${name(over.id)}.` : `${name(active.id)} was dropped.`,
    onDragCancel: ({ active }) => `Moving ${name(active.id)} was cancelled.`,
  };
}

/** A row inside SortableTasks: the grip handle starts drags; the row itself keeps its taps and links. */
/** `className`/`handleClassName` replace the legacy row and handle styling (library screens). */
export function SortableRow({ id, title, children, className = "sortable-row", handleClassName = "drag-handle" }: { id: string; title: string; children: ReactNode; className?: string; handleClassName?: string }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition };
  return <div ref={setNodeRef} style={style} className={className} data-dragging={isDragging || undefined}>
    <button type="button" ref={setActivatorNodeRef} className={handleClassName} aria-label={`Reorder ${title}`} {...attributes} {...listeners}><GripVertical aria-hidden="true" /></button>
    {children}
  </div>;
}
