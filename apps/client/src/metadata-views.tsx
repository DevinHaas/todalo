import { useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { Link, NavLink } from "react-router";
import { ChevronDown, Hash, Heart, ListFilter, Pencil, Plus, Sparkles, Tag, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  Button, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle, Field, FieldLabel, Hint, Input, InputGroup, InputGroupAddon,
  InputGroupInput, InputGroupText, Label, List, ListRow, PageHeader, PageSection, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  SidebarSectionHeader, Switch, Textarea, cn, sidebarItemClassName,
} from "./ui";
import { operationId, treeOrder, type TaskDto } from "./tasks";
import { Failure, listTree, TaskRow, type ReadState, type RowActions, type SelectionSlots } from "./views";
import { PendingNewTasks } from "./pending-changes";
import { CHARCOAL, namedColors, type FilterAssistDto, type FilterFields, type LabelDto, type LabelFields, type MetadataDto, type SavedFilterDto } from "./metadata";
import { definitionToQuery, FILTER_QUERY_MAX } from "../../../packages/server/src/filter-query";
import { FormError, Loading, LoadFailure } from "./goal-views";
import { releaseFocus } from "./software-keyboard";

// Pure screen views (the Filters & Labels page, its dialogs, the label and
// filter pages): no runtime imports, so they render in tests.
type Write = { pending: boolean; error: string | null };
export interface MetadataActions {
  /** `id` undefined creates; `operation` is the create's retry-safe ID. */
  saveLabel(id: string | undefined, label: LabelFields, operation: string): Promise<unknown>;
  deleteLabel(id: string): Promise<unknown>;
  saveFilter(id: string | undefined, filter: FilterFields, operation: string): Promise<unknown>;
  deleteFilter(id: string): Promise<unknown>;
  assistFilter(description: string): Promise<FilterAssistDto>;
}
/** The filter dialog's live preview: the open tasks each comma-separated list would show, or why the query can't be read. */
export type FilterPreview = (query: string) => { groups: { title: string; tasks: TaskDto[] }[] } | { error: string };

const NAME_MAX = 60;
/** One operation ID per unchanged create draft, so resubmitting after an unclear failure cannot duplicate. */
function useOperation() {
  const current = useRef<{ key: string; id: string } | null>(null);
  return (key: string) => { if (current.current?.key !== key) current.current = { key, id: operationId() }; return current.current.id; };
}
/** A filter's fields as stored, for a write that only changes some of them (a legacy definition stays a definition). */
const filterFields = (filter: SavedFilterDto): FilterFields => ({
  name: filter.name, description: filter.description, color: filter.color, favorite: filter.favorite,
  ...filter.query ? { query: filter.query } : { definition: filter.definition ?? { status: "open", due: "any" } },
});
const labelFields = (label: LabelDto): LabelFields => ({ name: label.name, color: label.color, favorite: label.favorite });
const colorOf = (item: { color: string | null }) => ({ color: item.color ?? CHARCOAL });

type Editing = { kind: "label"; label?: LabelDto } | { kind: "filter"; filter?: SavedFilterDto };
type Deleting = { kind: "label" | "filter"; id: string; name: string };

/** Todoist's Filters & Labels page (also /labels): My Filters and Labels, each collapsible with + to add. */
export function MetadataDirectory({ state, onRetry, projects, actions, write, preview }: {
  state: ReadState<MetadataDto>; onRetry: () => void; projects: { id: string; name: string }[]; actions: MetadataActions; write: Write; preview: FilterPreview;
}) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<Deleting | null>(null);
  const [collapsed, setCollapsed] = useState({ filters: false, labels: false });
  const operation = useOperation();
  const run = async (action: () => Promise<unknown>, after?: () => void) => { try { await action(); after?.(); } catch { /* shown through write.error */ } };
  const pending = write.pending;

  let body: ReactNode;
  if (state.status === "pending") body = <Loading>Loading filters and labels…</Loading>;
  else if (!state.data) body = <LoadFailure error={state.error} onRetry={onRetry} />;
  else {
    const { labels, filters } = state.data;
    const tools = (name: string, favorite: boolean, onEdit: () => void, onFavorite: () => void, onDelete: () => void) =>
      <span className="flex items-center opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 pointer-coarse:opacity-100">
        <Button variant="ghost" size="icon-sm" aria-label={`Edit ${name}`} title="Edit" disabled={pending} onClick={onEdit}><Pencil /></Button>
        <Button variant="ghost" size="icon-sm" aria-pressed={favorite} aria-label={favorite ? `Remove ${name} from favorites` : `Add ${name} to favorites`}
          title={favorite ? "Remove from favorites" : "Add to favorites"} disabled={pending} onClick={onFavorite}><Heart className={cn(favorite && "fill-current")} /></Button>
        <Button variant="ghost" size="icon-sm" aria-label={`Delete ${name}`} title="Delete" disabled={pending} onClick={onDelete}><Trash2 /></Button>
      </span>;
    const row = (key: string, to: string, icon: ReactNode, name: string, actions: ReactNode) => <ListRow key={key} className="gap-1 border-border">
      <Link to={to} className="flex min-h-control min-w-0 flex-1 items-center gap-3 text-sm no-underline [overflow-wrap:anywhere]">{icon}<span className="min-w-0">{name}</span></Link>{actions}
    </ListRow>;
    body = <>
      <CollapsibleSection title="My Filters" add="Add filter" collapsed={collapsed.filters} onToggle={() => setCollapsed(value => ({ ...value, filters: !value.filters }))} onAdd={() => setEditing({ kind: "filter" })}>
        {filters.length ? <List>{filters.map(filter => row(filter.id, `/filters/${encodeURIComponent(filter.id)}`, <ListFilter className="size-4.5 shrink-0" style={colorOf(filter)} aria-hidden="true" />, filter.name,
          tools(filter.name, filter.favorite, () => setEditing({ kind: "filter", filter }), () => void run(() => actions.saveFilter(filter.id, { ...filterFields(filter), favorite: !filter.favorite }, "")),
            () => setDeleting({ kind: "filter", id: filter.id, name: filter.name }))))}</List>
          : <Hint className="py-3 text-sm">Your list of filters will show up here.</Hint>}
      </CollapsibleSection>
      <CollapsibleSection title="Labels" add="Add label" collapsed={collapsed.labels} onToggle={() => setCollapsed(value => ({ ...value, labels: !value.labels }))} onAdd={() => setEditing({ kind: "label" })}>
        {labels.length ? <List>{labels.map(label => row(label.id, `/labels/${encodeURIComponent(label.id)}`, <Tag className="size-4.5 shrink-0" style={colorOf(label)} aria-hidden="true" />, label.name,
          tools(label.name, label.favorite, () => setEditing({ kind: "label", label }), () => void run(() => actions.saveLabel(label.id, { ...labelFields(label), favorite: !label.favorite }, "")),
            () => setDeleting({ kind: "label", id: label.id, name: label.name }))))}</List>
          : <Hint className="py-3 text-sm">Your list of labels will show up here.</Hint>}
      </CollapsibleSection>
      {editing?.kind === "label" && <LabelDialog label={editing.label} write={write} onClose={() => setEditing(null)}
        onSave={(fields) => run(() => actions.saveLabel(editing.label?.id, fields, operation(`label:${JSON.stringify(fields)}`)), () => setEditing(null))} />}
      {editing?.kind === "filter" && <FilterDialog filter={editing.filter} write={write} preview={preview} onAssist={actions.assistFilter} onClose={() => setEditing(null)}
        initialQuery={editing.filter ? editing.filter.query ?? definitionToQuery(editing.filter.definition ?? {}, { labels, projects }) : ""}
        onSave={(fields) => run(() => actions.saveFilter(editing.filter?.id, fields, operation(`filter:${JSON.stringify(fields)}`)), () => setEditing(null))} />}
      <AlertDialog open={deleting !== null} onOpenChange={(open) => { if (!open) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete {deleting?.kind}?</AlertDialogTitle>
            <AlertDialogDescription>{deleting?.kind === "label" ? `Delete label ${deleting.name}? Tasks are kept.` : `Delete filter ${deleting?.name}?`}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={pending} onClick={() => deleting && void run(() => deleting.kind === "label" ? actions.deleteLabel(deleting.id) : actions.deleteFilter(deleting.id), () => setDeleting(null))}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>;
  }
  return <div className="ui max-w-page">
    <PageHeader title="Filters & Labels" />
    {write.error && !editing && <FormError>{write.error}</FormError>}
    {body}
  </div>;
}

function CollapsibleSection({ title, add, collapsed, onToggle, onAdd, children }: { title: string; add: string; collapsed: boolean; onToggle: () => void; onAdd: () => void; children: ReactNode }) {
  return <PageSection aria-label={title} title={<button type="button" className="flex items-center gap-1.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-expanded={!collapsed} onClick={onToggle}>
    <ChevronDown className={cn("size-4 text-subtle-foreground transition-transform", collapsed && "-rotate-90")} aria-hidden="true" />{title}
  </button>} actions={<Button variant="ghost" size="icon-sm" aria-label={add} title={add} onClick={onAdd}><Plus /></Button>}>
    {!collapsed && children}
  </PageSection>;
}

/** A name field with Todoist's character counter. */
export function NameField({ id, value, onChange, max = NAME_MAX }: { id: string; value: string; onChange: (value: string) => void; max?: number }) {
  return <Field><FieldLabel htmlFor={id}>Name</FieldLabel>
    <InputGroup><InputGroupInput id={id} value={value} onChange={event => onChange(event.target.value)} maxLength={Math.max(max, value.length)} autoFocus required />
      <InputGroupAddon align="inline-end"><InputGroupText className="tabular-nums">{value.length}/{max}</InputGroupText></InputGroupAddon></InputGroup>
  </Field>;
}

const Dot = ({ color }: { color: string }) => <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />;
/** Todoist's named colours; a colour saved before them (any hex) stays selectable as Custom. */
export function ColorField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const current = value.toLowerCase();
  const items = [...namedColors.map(([label, hex]) => ({ value: hex as string, label })), ...namedColors.some(([, hex]) => hex === current) ? [] : [{ value: current, label: "Custom" }]];
  return <Field><FieldLabel>Color</FieldLabel>
    <Select items={items} value={current} onValueChange={(next) => { if (next) onChange(next as string); }}>
      <SelectTrigger aria-label="Color" className="w-full"><Dot color={current} /><SelectValue /></SelectTrigger>
      <SelectContent>{items.map(item => <SelectItem key={item.value} value={item.value}><Dot color={item.value} />{item.label}</SelectItem>)}</SelectContent>
    </Select>
  </Field>;
}

export function FavoriteSwitch({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return <Label className="flex min-h-control cursor-pointer items-center gap-2 font-normal"><Switch checked={checked} onCheckedChange={onChange} />Add to favorites</Label>;
}

export function EditorDialog({ title, wide, submit, canSubmit, write, onSubmit, onClose, children }: {
  title: string; wide?: boolean; submit: string; canSubmit: boolean; write: Write; onSubmit: () => void; onClose: () => void; children: ReactNode;
}) {
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent layout="sections" size={wide ? "xl" : "default"}>
      <form ref={releaseFocus} className="flex max-h-[calc(100svh-4rem)] flex-col" onSubmit={(event: FormEvent) => { event.preventDefault(); if (canSubmit) onSubmit(); }}>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <DialogBody className="overflow-y-auto">{children}{write.error && <FormError>{write.error}</FormError>}</DialogBody>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={write.pending || !canSubmit}>{submit}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

/** Add label / Edit label: name (60), colour (Charcoal) and favorite. */
export function LabelDialog({ label, write, onSave, onClose }: { label?: LabelDto; write: Write; onSave: (fields: LabelFields) => void; onClose: () => void }) {
  const [name, setName] = useState(label?.name ?? "");
  const [color, setColor] = useState(label?.color ?? CHARCOAL);
  const [favorite, setFavorite] = useState(label?.favorite ?? false);
  return <EditorDialog title={label ? "Edit label" : "Add label"} submit={label ? "Save" : "Add"} canSubmit={Boolean(name.trim())} write={write} onClose={onClose}
    onSubmit={() => onSave({ name: name.trim(), color, favorite })}>
    <NameField id="label-name" value={name} onChange={setName} />
    <ColorField value={color} onChange={setColor} />
    <FavoriteSwitch checked={favorite} onChange={setFavorite} />
  </EditorDialog>;
}

const PREVIEW_ROWS = 8;
/** Add filter / Edit filter: Filter Assist, name, description, colour, favorite, query and a live preview. */
export function FilterDialog({ filter, initialQuery, write, preview, onAssist, onSave, onClose }: {
  filter?: SavedFilterDto; initialQuery: string; write: Write; preview: FilterPreview;
  onAssist: (description: string) => Promise<FilterAssistDto>; onSave: (fields: FilterFields) => void; onClose: () => void;
}) {
  const [name, setName] = useState(filter?.name ?? "");
  const [description, setDescription] = useState(filter?.description ?? "");
  const [color, setColor] = useState(filter?.color ?? CHARCOAL);
  const [favorite, setFavorite] = useState(filter?.favorite ?? false);
  const [query, setQuery] = useState(initialQuery);
  const result = useMemo(() => query.trim() ? preview(query.trim()) : null, [query, preview]);
  const valid = result !== null && !("error" in result);
  return <EditorDialog title={filter ? "Edit filter" : "Add filter"} wide submit={filter ? "Save" : "Add"} canSubmit={Boolean(name.trim()) && valid} write={write} onClose={onClose}
    onSubmit={() => onSave({ name: name.trim(), query: query.trim(), description: description.trim() || null, color, favorite })}>
    <FilterAssist onAssist={onAssist} onQuery={setQuery} />
    <NameField id="filter-name" value={name} onChange={setName} />
    <Field><FieldLabel htmlFor="filter-description">Description</FieldLabel>
      <Textarea id="filter-description" value={description} onChange={event => setDescription(event.target.value)} rows={3} maxLength={1000} placeholder="Add a description" /></Field>
    <ColorField value={color} onChange={setColor} />
    <FavoriteSwitch checked={favorite} onChange={setFavorite} />
    <Field><FieldLabel htmlFor="filter-query">Query</FieldLabel>
      <InputGroup><InputGroupInput id="filter-query" value={query} onChange={event => setQuery(event.target.value)} maxLength={FILTER_QUERY_MAX} placeholder="(today | overdue) & #Work"
        aria-invalid={result !== null && !valid} spellCheck={false} autoCapitalize="off" autoCorrect="off" />
        <InputGroupAddon align="inline-end"><InputGroupText className="tabular-nums">{query.length}/{FILTER_QUERY_MAX}</InputGroupText></InputGroupAddon></InputGroup>
      {filter?.definition && filter.definition.status !== "open" && <Hint>Made with the earlier filter form. Saving turns it into this query, which lists open tasks only.</Hint>}
    </Field>
    <section aria-label="Preview" className="flex flex-col gap-1.5">
      <h3 className="text-sm font-semibold">Preview</h3>
      {result === null ? <Hint>Matching tasks show up here as you type a query.</Hint>
        : "error" in result ? <FormError>{result.error}</FormError>
        : result.groups.map((group, index) => <div key={index} className="flex flex-col">
          {result.groups.length > 1 && <p className="pt-1 text-xs-plus font-semibold text-muted-foreground">{group.title}</p>}
          {group.tasks.length ? <List>{group.tasks.slice(0, PREVIEW_ROWS).map(task => <ListRow key={task.id} className="min-h-0 py-1 text-sm"><span className="min-w-0 truncate">{task.title}</span></ListRow>)}</List>
            : <Hint className="py-1">No open tasks match.</Hint>}
          {group.tasks.length > PREVIEW_ROWS && <Hint className="py-1">and {group.tasks.length - PREVIEW_ROWS} more</Hint>}
        </div>)}
    </section>
  </EditorDialog>;
}

/** Describe the filter; the Coach writes a query the parser accepts (the server checks it). */
function FilterAssist({ onAssist, onQuery }: { onAssist: (description: string) => Promise<FilterAssistDto>; onQuery: (query: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function generate() {
    if (!text.trim() || busy) return;
    setBusy(true); setMessage(null);
    try {
      const reply = await onAssist(text.trim());
      if (reply.query !== null) { onQuery(reply.query); setMessage("Query added below. Check the preview before saving."); }
      else setMessage(reply.message);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Filter Assist is unavailable. Try again."); }
    finally { setBusy(false); }
  }
  const enter = (event: KeyboardEvent) => { if (event.key === "Enter") { event.preventDefault(); void generate(); } };
  return <section aria-label="Filter Assist" className="flex items-start gap-3 rounded-xl border border-border p-4">
    <Sparkles className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden="true" />
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <p className="text-sm font-semibold">Filter Assist</p>
      <Hint>Describe the filter you want and we'll generate the query for you.</Hint>
      {open && <div className="mt-1 flex gap-2">
        <Input aria-label="Describe the filter" placeholder="High-priority work due this week" value={text} autoFocus onChange={event => setText(event.target.value)} onKeyDown={enter} maxLength={500} />
        <Button type="button" disabled={busy || !text.trim()} onClick={() => void generate()}>{busy ? "Generating…" : "Generate"}</Button>
      </div>}
      {message && <Hint role="status">{message}</Hint>}
    </div>
    {!open && <Button type="button" onClick={() => setOpen(true)}>Try it</Button>}
  </section>;
}

/** The sidebar's Favorites (Todoist): favorite projects, filters and labels, only when there are some. */
export function FavoritesNav({ metadata, projects = [] }: { metadata?: MetadataDto; projects?: { id: string; name: string; color: string | null; favorite: boolean; archived: boolean }[] }) {
  const filters = metadata?.filters.filter(item => item.favorite) ?? [];
  const labels = metadata?.labels.filter(item => item.favorite) ?? [];
  const favoriteProjects = projects.filter(item => item.favorite && !item.archived);
  if (!filters.length && !labels.length && !favoriteProjects.length) return null;
  const item = (key: string, to: string, icon: ReactNode, name: string) => <NavLink key={key} to={to} className={sidebarItemClassName}>{icon}<span className="flex-1 truncate">{name}</span></NavLink>;
  return <section className="ui mb-3 flex flex-col" aria-label="Favorites">
    <SidebarSectionHeader title="Favorites" />
    {favoriteProjects.map(project => item(project.id, `/projects/${encodeURIComponent(project.id)}`, <Hash style={colorOf(project)} />, project.name))}
    {filters.map(filter => item(filter.id, `/filters/${encodeURIComponent(filter.id)}`, <ListFilter style={colorOf(filter)} />, filter.name))}
    {labels.map(label => item(label.id, `/labels/${encodeURIComponent(label.id)}`, <Tag style={colorOf(label)} />, label.name))}
  </section>;
}

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
/** Legacy ListView buckets (completed tasks included): Today, Upcoming (any other date), No date. */
export function listBuckets(tasks: TaskDto[], now = new Date()) {
  const today = (task: TaskDto) => task.dueDate !== null && sameDay(new Date(task.dueDate), now);
  const ids = new Set(tasks.map(task => task.id));
  const buckets = [
    { label: "Today", items: tasks.filter(today) },
    { label: "Upcoming", items: tasks.filter(task => task.dueDate !== null && !today(task)) },
    { label: "No date", items: tasks.filter(task => task.dueDate === null) },
  ];
  // A sub-task stays under its listed parent (its row chevron shows it) instead of a bucket of its own.
  return buckets.map(bucket => {
    const inBucket = new Set(bucket.items.map(task => task.id));
    return { ...bucket, items: treeOrder(bucket.items.filter(task => !task.parentId || !ids.has(task.parentId) || inBucket.has(task.parentId))) };
  }).filter(bucket => bucket.items.length > 0);
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
    {listBuckets(tasks, now).map(bucket => { const tree = listTree(bucket.items); return <section key={bucket.label}>
      <h2 className="section-heading muted">{bucket.label}</h2>
      {bucket.items.map(task => <TaskRow key={task.id} task={task} now={now} projectName={task.projectId ? projectNames[task.projectId] : undefined} actions={actions} selection={selection?.row(task)} {...tree(task)} />)}
    </section>; })}
  </div></>;
}

/** Legacy label, saved-filter or Inbox page: its name, the manage link and the matching tasks. */
export function TaskCollectionView({ kind, state, onRetry, ...slots }: CollectionSlots & {
  kind: "label" | "filter" | "inbox"; onRetry: () => void;
  /** A query filter: its description, and one list per comma-separated part (more than one replaces the date buckets). */
  state: ReadState<{ name: string; tasks: TaskDto[]; description?: string | null; groups?: { title: string; tasks: TaskDto[] }[] } | null>;
}) {
  const manage = kind === "label" ? <Link className="text-action" to="/labels">Manage labels</Link> : kind === "filter" ? <Link className="text-action" to="/filters">Manage filters</Link> : null;
  if (state.status === "pending") return <p className="state" role="status">Loading tasks…</p>;
  if (state.status === "error" && !state.data) return <Failure error={state.error} onRetry={onRetry} />;
  if (!state.data) return <div className="collection"><h1 className="page-title">{kind === "label" ? "Label not found" : "Filter not found"}</h1>
    <p className="state">This {kind} does not exist or you do not have access to it.</p>{manage}</div>;
  return <div className="collection">
    <div className="project-header"><h1 className="page-title">{state.data.name}</h1>{!slots.layout && slots.selection?.control}</div>
    {state.data.description && <p className="state">{state.data.description}</p>}
    {manage}
    {state.status === "error" && <Failure error={state.error} onRetry={onRetry} />}
    {state.data.groups && state.data.groups.length > 1 && !slots.layout ? <>{slots.selection?.toolbar}<div className="sections">
      {state.data.groups.map((group, index) => { const items = treeOrder(group.tasks); const tree = listTree(items); return <section key={index}>
        <h2 className="section-heading muted">{group.title}</h2>
        {items.length ? items.map(task => <TaskRow key={task.id} task={task} now={slots.now ?? new Date()} projectName={task.projectId ? slots.projectNames?.[task.projectId] : undefined} actions={slots.actions} selection={slots.selection?.row(task)} {...tree(task)} />)
          : <p className="state">No tasks.</p>}
      </section>; })}
    </div></> : <CollectionBody tasks={state.data.tasks} {...slots} />}
    {/* Ticket 29: a Coach draft's new tasks land in the Inbox once accepted. */}
    {kind === "inbox" && !slots.layout && <PendingNewTasks />}
  </div>;
}
