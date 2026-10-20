import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router";
import { operationId, treeOrder, type TaskDto } from "./tasks";
import { Failure, TaskRow, type ReadState, type RowActions, type SelectionSlots } from "./views";
import { blankDefinition, type FilterDefinition, type FilterFields, type LabelFields, type MetadataDto } from "./metadata";
import type { ProjectDto } from "./projects";
import { releaseFocus } from "./software-keyboard";

// Pure screen views (legacy MetadataDirectory and the /labels/:id, /filters/:id
// pages): no runtime imports, so they render in tests.
type Write = { pending: boolean; error: string | null };
export interface MetadataActions {
  /** `id` undefined creates; `operation` is the create's retry-safe ID. */
  saveLabel(id: string | undefined, label: LabelFields, operation: string): Promise<unknown>;
  deleteLabel(id: string): Promise<unknown>;
  saveFilter(id: string | undefined, filter: FilterFields, operation: string): Promise<unknown>;
  deleteFilter(id: string): Promise<unknown>;
}

const GRAY = "#808080";
const missing = (id: string | null | undefined, rows: { id: string }[], name: string): [string, string][] => id && !rows.some(row => row.id === id) ? [[id, name]] : [];
/** One operation ID per unchanged create draft, so resubmitting after an unclear failure cannot duplicate. */
function useOperation() {
  const current = useRef<{ key: string; id: string } | null>(null);
  return {
    for(key: string) { if (current.current?.key !== key) current.current = { key, id: operationId() }; return current.current.id; },
    reset() { current.current = null; },
  };
}

/** In-page confirmation (legacy confirm() copy): native confirm() is unreliable in iOS WKWebView. */
function Confirm({ message, pending, onConfirm, onCancel }: { message: string; pending: boolean; onConfirm: () => void; onCancel: () => void }) {
  return <div className="confirm" role="group" aria-label="Confirm deletion">
    <p>{message}</p>
    <div className="project-actions">
      <button type="button" className="button destructive" disabled={pending} onClick={onConfirm}>Delete</button>
      <button type="button" className="button outline" disabled={pending} onClick={onCancel}>Cancel</button>
    </div>
  </div>;
}

export function MetadataDirectory({ mode, state, onRetry, projects, actions, write }: {
  mode: "labels" | "filters"; state: ReadState<MetadataDto>; onRetry: () => void; projects: ProjectDto[]; actions: MetadataActions; write: Write;
}) {
  const [labelId, setLabelId] = useState<string>(); const [labelName, setLabelName] = useState(""); const [color, setColor] = useState(GRAY);
  const [filterId, setFilterId] = useState<string>(); const [filterName, setFilterName] = useState(""); const [definition, setDefinition] = useState<FilterDefinition>(blankDefinition);
  const [confirming, setConfirming] = useState<{ kind: "label" | "filter"; id: string; name: string } | null>(null);
  const labelOperation = useOperation(); const filterOperation = useOperation();
  const resetLabel = () => { setLabelId(undefined); setLabelName(""); setColor(GRAY); labelOperation.reset(); };
  const resetFilter = () => { setFilterId(undefined); setFilterName(""); setDefinition(blankDefinition()); filterOperation.reset(); };
  const run = async (action: () => Promise<unknown>, after?: () => void) => { try { await action(); after?.(); } catch { /* shown through write.error */ } };
  const pending = write.pending;

  async function submitLabel(event: FormEvent) {
    event.preventDefault();
    const fields = { name: labelName.trim(), color };
    await run(() => actions.saveLabel(labelId, fields, labelOperation.for(JSON.stringify(fields))), resetLabel);
  }
  async function submitFilter(event: FormEvent) {
    event.preventDefault();
    const fields = { name: filterName.trim(), definition };
    await run(() => actions.saveFilter(filterId, fields, filterOperation.for(JSON.stringify(fields))), resetFilter);
  }
  const select = (label: string, value: string, change: (value: string) => void, options: [string, string][]) =>
    <label>{label}<select aria-label={`Filter ${label.toLowerCase()}`} value={value} disabled={pending} onChange={event => change(event.target.value)}>
      {options.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
    </select></label>;

  let body: ReactNode;
  if (state.status === "pending") body = <p className="state" role="status">Loading labels…</p>;
  else if (!state.data) body = <Failure error={state.error} onRetry={onRetry} />;
  else {
    const { labels, filters } = state.data;
    body = <>
      <section className="metadata-section"><h2 className="section-heading">Labels</h2>
        {labels.length ? <ul className="metadata-list">{labels.map(label => <li key={label.id}>
          <span className="label-dot" style={{ backgroundColor: label.color ?? GRAY }} />
          <Link to={`/labels/${encodeURIComponent(label.id)}`}>{label.name}</Link>
          <span className="metadata-actions">
            <button type="button" className="button ghost small" disabled={pending} onClick={() => { setLabelId(label.id); setLabelName(label.name); setColor(label.color ?? GRAY); }}>Edit {label.name}</button>
            <button type="button" className="button ghost small" disabled={pending} onClick={() => setConfirming({ kind: "label", id: label.id, name: label.name })}>Delete {label.name}</button>
          </span>
        </li>)}</ul> : <p className="state">No labels yet.</p>}
        {confirming?.kind === "label" && <Confirm message={`Delete label ${confirming.name}? Tasks are kept.`} pending={pending}
          onCancel={() => setConfirming(null)} onConfirm={() => void run(() => actions.deleteLabel(confirming.id), () => { setConfirming(null); if (labelId === confirming.id) resetLabel(); })} />}
        <form ref={releaseFocus} className="metadata-form label-form" onSubmit={submitLabel}>
          <label className="grow">Label name<input aria-label="Label name" value={labelName} onChange={event => setLabelName(event.target.value)} required maxLength={100} disabled={pending} /></label>
          <label>Color<input aria-label="Label color" type="color" value={color} onChange={event => setColor(event.target.value)} disabled={pending} /></label>
          <button type="submit" className="button" disabled={pending || !labelName.trim()}>{labelId ? "Save label" : "Create label"}</button>
          {labelId && <button type="button" className="button ghost" onClick={resetLabel}>Cancel</button>}
        </form>
      </section>
      {mode === "filters" && <section className="metadata-section"><h2 className="section-heading">Saved filters</h2>
        <p className="state">All chosen conditions must match. Filters support priority, label, project, completion status, and due date.</p>
        {filters.length > 0 && <ul className="metadata-list">{filters.map(filter => <li key={filter.id}>
          <Link to={`/filters/${encodeURIComponent(filter.id)}`}>{filter.name}</Link>
          <span className="metadata-actions">
            <button type="button" className="button ghost small" disabled={pending} onClick={() => { setFilterId(filter.id); setFilterName(filter.name); setDefinition(filter.definition); }}>Edit {filter.name}</button>
            <button type="button" className="button ghost small" disabled={pending} onClick={() => setConfirming({ kind: "filter", id: filter.id, name: filter.name })}>Delete {filter.name}</button>
          </span>
        </li>)}</ul>}
        {confirming?.kind === "filter" && <Confirm message={`Delete filter ${confirming.name}?`} pending={pending}
          onCancel={() => setConfirming(null)} onConfirm={() => void run(() => actions.deleteFilter(confirming.id), () => { setConfirming(null); if (filterId === confirming.id) resetFilter(); })} />}
        <form ref={releaseFocus} className="metadata-form" onSubmit={submitFilter}>
          <label>Filter name<input aria-label="Filter name" value={filterName} onChange={event => setFilterName(event.target.value)} required maxLength={100} disabled={pending} /></label>
          <div className="filter-grid">
            {select("Priority", String(definition.priority ?? ""), value => setDefinition({ ...definition, priority: value ? Number(value) : null }), [["", "Any priority"], ...[1, 2, 3, 4].map(value => [String(value), `Priority ${value}`] as [string, string])])}
            {/* A deleted label or project stays selected, named as deleted; saving it is refused (legacy rule). */}
            {select("Label", definition.labelId ?? "", value => setDefinition({ ...definition, labelId: value || null }), [["", "Any label"], ...labels.map(label => [label.id, label.name] as [string, string]), ...missing(definition.labelId, labels, "Deleted label")])}
            {select("Project", definition.projectId ?? "", value => setDefinition({ ...definition, projectId: value || null }), [["", "Any project"], ...projects.map(project => [project.id, project.name] as [string, string]), ...missing(definition.projectId, projects, "Deleted project")])}
            {select("Status", definition.status, value => setDefinition({ ...definition, status: value as FilterDefinition["status"] }), [["open", "Open"], ["done", "Completed"], ["any", "Any"]])}
            {select("Due date", definition.due, value => setDefinition({ ...definition, due: value as FilterDefinition["due"] }), [["any", "Any date"], ["today", "Today"], ["overdue", "Overdue"], ["undated", "No due date"]])}
          </div>
          <div className="project-actions">
            <button type="submit" className="button" disabled={pending || !filterName.trim()}>{filterId ? "Save filter" : "Create filter"}</button>
            {filterId && <button type="button" className="button ghost" onClick={resetFilter}>Cancel</button>}
          </div>
        </form>
      </section>}
    </>;
  }
  return <div className="directory">
    <h1 className="page-title">{mode === "labels" ? "Labels" : "Filters & Labels"}</h1>
    <nav className="metadata-nav"><Link to="/labels">Labels</Link><Link to="/filters">Filters & Labels</Link></nav>
    {write.error && <p className="form-error" role="alert">{write.error}</p>}
    {body}
  </div>;
}

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
/** Legacy ListView buckets (completed tasks included): Today, Upcoming (any other date), No date. */
export function listBuckets(tasks: TaskDto[], now = new Date()) {
  const today = (task: TaskDto) => task.dueDate !== null && sameDay(new Date(task.dueDate), now);
  return [
    { label: "Today", items: tasks.filter(today) },
    { label: "Upcoming", items: tasks.filter(task => task.dueDate !== null && !today(task)) },
    { label: "No date", items: tasks.filter(task => task.dueDate === null) },
  ].filter(bucket => bucket.items.length > 0).map(bucket => ({ ...bucket, items: treeOrder(bucket.items) }));
}

/** What every legacy ViewSwitcher collection takes: row writes, the selection (list only) and another Display layout. */
export interface CollectionSlots {
  projectNames?: Record<string, string>; actions?: RowActions; now?: Date;
  /** Ticket 15: Select button, toolbar and row checkboxes (list layout only, as Today). */
  selection?: SelectionSlots;
  /** Board or Calendar from Display, over the same tasks, in place of the list. */
  layout?: (tasks: TaskDto[]) => ReactNode;
}

/** Legacy ListView body (label, filter, Inbox and search pages): selection toolbar and bucketed rows, or the chosen layout. */
export function CollectionBody({ tasks, projectNames = {}, actions, now = new Date(), selection, layout }: CollectionSlots & { tasks: TaskDto[] }) {
  if (layout) return <>{layout(tasks)}</>;
  return <>{selection?.toolbar}<div className="sections">
    {listBuckets(tasks, now).map(bucket => <section key={bucket.label}>
      <h2 className="section-heading muted">{bucket.label}</h2>
      {bucket.items.map(task => <TaskRow key={task.id} task={task} now={now} projectName={task.projectId ? projectNames[task.projectId] : undefined} actions={actions} selection={selection?.row(task)} />)}
    </section>)}
  </div></>;
}

/** Legacy label, saved-filter or Inbox page: its name, the manage link and the matching tasks. */
export function TaskCollectionView({ kind, state, onRetry, writeError, ...slots }: CollectionSlots & {
  kind: "label" | "filter" | "inbox"; state: ReadState<{ name: string; tasks: TaskDto[] } | null>; onRetry: () => void; writeError?: string | null;
}) {
  const manage = kind === "label" ? <Link className="text-action" to="/labels">Manage labels</Link> : kind === "filter" ? <Link className="text-action" to="/filters">Manage filters</Link> : null;
  if (state.status === "pending") return <p className="state" role="status">Loading tasks…</p>;
  if (state.status === "error" && !state.data) return <Failure error={state.error} onRetry={onRetry} />;
  if (!state.data) return <div className="collection"><h1 className="page-title">{kind === "label" ? "Label not found" : "Filter not found"}</h1>
    <p className="state">This {kind} does not exist or you do not have access to it.</p>{manage}</div>;
  return <div className="collection">
    <div className="project-header"><h1 className="page-title">{state.data.name}</h1>{!slots.layout && slots.selection?.control}</div>
    {manage}
    {state.status === "error" && <Failure error={state.error} onRetry={onRetry} />}
    {writeError && <p role="alert" className="form-error">{writeError}</p>}
    <CollectionBody tasks={state.data.tasks} {...slots} />
  </div>;
}
