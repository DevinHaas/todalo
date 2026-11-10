import { useContext, useEffect, useState, type FormEvent, type MouseEvent, type ReactNode } from "react";
import { Link } from "react-router";
import { DndContext, DragOverlay, closestCorners, pointerWithin, useDroppable, type CollisionDetection, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import {
  Archive, ArchiveRestore, CalendarDays, ChevronDown, Ellipsis, GitBranch, Hash, Heart, LayoutGrid, Link2, List as ListIcon, MessageSquare,
  Pencil, Plus, Search, SlidersHorizontal, Table2, Trash2,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator, Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuShortcut, DropdownMenuTrigger, Hint, Input, InputGroup, InputGroupAddon, InputGroupInput, Label, PageHeader, Popover, PopoverContent, PopoverTitle,
  PopoverTrigger, Progress, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch, Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  Textarea, ToggleGroup, ToggleGroupItem, cn,
} from "./ui";
import { dateInputValue, shortDateLabel, treeOrder, type NewTask, type TaskDto } from "./tasks";
import { Composer, Failure, listTree, TaskDialogs, TaskRow, type ReadState, type RowActions, type SelectionSlots } from "./views";
import { SortableRow, SortableTasks, dragAnnouncements, useDragSensors } from "./bulk-views";
import { reorderAnchor, type ReorderPosition } from "./bulk";
import {
  displayChanges, filterProjectTasks, groupProjectTasks, sortProjectTasks,
  type NewProject, type ProjectChange, type ProjectDetailDto, type ProjectDisplay, type ProjectDto, type ProjectSummaryDto,
} from "./projects";
import { defaultProjectDisplay, DESCRIPTION_MAX } from "../../../packages/server/src/project-dto";
import type { SectionDto } from "./organization";
import { sectionGroups } from "./organization-views";
import { CHARCOAL } from "./metadata";
import { ColorField, EditorDialog, FavoriteSwitch, NameField } from "./metadata-views";
import { FormError } from "./goal-views";
import { releaseFocus } from "./software-keyboard";

// Pure screen views (Todoist's My Projects page and project page with its
// Display popover, list, board and table layouts): no runtime imports.
/** Failures are toasted (toasts.ts); forms keep their input. */
type Write = { pending: boolean; error?: string | null };
const PROJECT_NAME_MAX = 120;
const projectPath = (id: string) => `/projects/${encodeURIComponent(id)}`;
const colorOf = (project: { color: string | null }) => ({ color: project.color ?? CHARCOAL });
const run = async (action: () => Promise<unknown>, after?: () => void) => { try { await action(); after?.(); } catch { /* toasted */ } };

/** My Projects' writes, and a project page's (bound to its project). */
export interface ProjectsActions { create(project: NewProject): Promise<unknown>; update(id: string, change: ProjectChange): Promise<unknown>; remove(id: string): Promise<unknown> }
export interface ProjectActions { update(change: ProjectChange): Promise<unknown>; remove(): void; copyLink(): void }

/** Add project / Edit project: name, colour and favorite. */
export function ProjectDialog({ project, write, onSave, onClose }: { project?: ProjectDto; write: Write; onSave: (fields: NewProject) => void; onClose: () => void }) {
  const [name, setName] = useState(project?.name ?? "");
  const [color, setColor] = useState(project?.color ?? CHARCOAL);
  const [favorite, setFavorite] = useState(project?.favorite ?? false);
  return <EditorDialog title={project ? "Edit project" : "Add project"} submit={project ? "Save" : "Add"} canSubmit={Boolean(name.trim())} write={{ pending: write.pending, error: write.error ?? null }}
    onClose={onClose} onSubmit={() => onSave({ name: name.trim(), color, favorite })}>
    <NameField id="project-name" value={name} onChange={setName} max={PROJECT_NAME_MAX} />
    <ColorField value={color} onChange={setColor} />
    <FavoriteSwitch checked={favorite} onChange={setFavorite} />
  </EditorDialog>;
}

function DeleteProjectDialog({ project, pending, onDelete, onClose }: { project: ProjectDto | null; pending: boolean; onDelete: () => void; onClose: () => void }) {
  return <AlertDialog open={project !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
    <AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>Delete project?</AlertDialogTitle>
        <AlertDialogDescription>This will delete {project ? `"${project.name}"` : "the project"} and its sections. Its tasks move to the Inbox.</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction variant="destructive" disabled={pending} onClick={onDelete}>Delete</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}

/** Todoist's My Projects: search, "Archived projects only", + Add, and Completed / Open / Progress per project. */
export function ProjectsView({ state, onRetry, actions, write }: { state: ReadState<ProjectSummaryDto[]>; onRetry: () => void; actions?: ProjectsActions; write: Write }) {
  const [query, setQuery] = useState("");
  const [archived, setArchived] = useState(false);
  const [editing, setEditing] = useState<ProjectDto | "new" | null>(null);
  const [deleting, setDeleting] = useState<ProjectDto | null>(null);
  let body: ReactNode;
  if (state.status === "pending" && !state.data) body = <p className="state" role="status">Loading projects…</p>;
  else if (!state.data) body = <Failure error={state.error} onRetry={onRetry} />;
  else {
    const needle = query.trim().toLowerCase();
    const shown = state.data.filter(project => project.archived === archived && project.name.toLowerCase().includes(needle));
    body = <>
      <Table className="table-fixed">
        <TableHeader><TableRow>
          <TableHead>Projects</TableHead><TableHead className="w-24 text-right">Completed</TableHead><TableHead className="w-20 text-right">Open</TableHead>
          <TableHead className="w-44">Progress</TableHead><TableHead className="w-10"><span className="sr-only">Actions</span></TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {shown.map(project => {
            const total = project.completedCount + project.openCount;
            const percent = total ? Math.round(project.completedCount / total * 100) : 0;
            return <TableRow key={project.id} className="group/row" data-project-row={project.id}>
              <TableCell><Link to={projectPath(project.id)} className="flex min-w-0 items-center gap-2 no-underline">
                <Hash className="size-4 shrink-0" style={colorOf(project)} aria-hidden="true" /><span className="truncate">{project.name}</span>
              </Link></TableCell>
              <TableCell className="text-right tabular-nums">{project.completedCount}</TableCell>
              <TableCell className="text-right tabular-nums">{project.openCount}</TableCell>
              <TableCell><div className="flex items-center gap-2">
                <Progress value={percent} aria-label={`${project.name}: ${percent}% complete`} className="flex-1" />
                <span className="w-9 text-right text-xs-plus tabular-nums text-muted-foreground">{percent}%</span>
              </div></TableCell>
              <TableCell>{actions && <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`More actions for ${project.name}`} className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100 pointer-coarse:opacity-100" />}><Ellipsis /></DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-48">
                  <DropdownMenuItem onClick={() => setEditing(project)}><Pencil />Edit</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void run(() => actions.update(project.id, { favorite: !project.favorite }))}><Heart />{project.favorite ? "Remove from favorites" : "Add to favorites"}</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => void run(() => actions.update(project.id, { archived: !project.archived }))}>{project.archived ? <><ArchiveRestore />Unarchive</> : <><Archive />Archive</>}</DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onClick={() => setDeleting(project)}><Trash2 />Delete</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>}</TableCell>
            </TableRow>;
          })}
        </TableBody>
      </Table>
      {shown.length === 0 && <Hint className="py-4 text-sm">{needle ? "No projects match your search." : archived ? "No archived projects." : "Create a project to organize your tasks."}</Hint>}
      {actions && !archived && <Button variant="ghost" className="mt-1 justify-start text-muted-foreground" onClick={() => setEditing("new")}><Plus className="text-brand" />Add project</Button>}
    </>;
  }
  return <div className="ui max-w-page">
    <PageHeader title="My Projects" />
    <div className="mb-3 flex flex-wrap items-center gap-3">
      <InputGroup className="max-w-64"><InputGroupAddon><Search /></InputGroupAddon>
        <InputGroupInput aria-label="Search projects" placeholder="Search projects" value={query} onChange={event => setQuery(event.target.value)} /></InputGroup>
      <Label className="flex min-h-control cursor-pointer items-center gap-2 font-normal"><Switch checked={archived} onCheckedChange={setArchived} />Archived projects only</Label>
      {actions && <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="secondary" className="ml-auto" />}><Plus />Add<ChevronDown /></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-40"><DropdownMenuItem onClick={() => setEditing("new")}><Hash />Add project</DropdownMenuItem></DropdownMenuContent>
      </DropdownMenu>}
    </div>
    {body}
    {actions && editing && <ProjectDialog project={editing === "new" ? undefined : editing} write={write} onClose={() => setEditing(null)}
      onSave={(fields) => void run(() => editing === "new" ? actions.create(fields) : actions.update(editing.id, fields), () => setEditing(null))} />}
    {actions && <DeleteProjectDialog project={deleting} pending={write.pending} onClose={() => setDeleting(null)} onDelete={() => deleting && void run(() => actions.remove(deleting.id), () => setDeleting(null))} />}
  </div>;
}

/** Section writes; `after` places a new section after that one (null: first; absent: last). */
export interface SectionActions { create(name: string, after?: string | null): Promise<unknown>; rename(section: SectionDto, name: string): Promise<unknown>; remove(section: SectionDto): void }
/** Inline edits from the table and row tools: a YYYY-MM-DD day, or null to clear. */
export interface DateActions { due(task: TaskDto, day: string | null): void; deadline(task: TaskDto, day: string | null): void }

const layouts = [["list", "List", ListIcon], ["board", "Board", LayoutGrid], ["calendar", "Calendar", CalendarDays], ["table", "Table", Table2]] as const;
const options = {
  grouping: [["none", "None (sections)"], ["date", "Date"], ["deadline", "Deadline"], ["added", "Date added"], ["priority", "Priority"], ["label", "Label"]],
  sorting: [["manual", "Manual"], ["date", "Date"], ["deadline", "Deadline"], ["added", "Date added"], ["priority", "Priority"], ["name", "Name"]],
  date: [["all", "All"], ["today", "Today"], ["week", "This week"], ["overdue", "Overdue"], ["none", "No date"]],
  deadline: [["all", "All"], ["week", "This week"], ["overdue", "Overdue"], ["any", "Has deadline"], ["none", "No deadline"]],
  created: [["all", "All"], ["today", "Today"], ["week", "Last 7 days"], ["month", "Last 30 days"]],
  priority: [["all", "All"], ["1", "Priority 1"], ["2", "Priority 2"], ["3", "Priority 3"], ["4", "Priority 4"]],
} as const;
type Option = keyof typeof options | "label";

/** Todoist's Display popover: layout, completed tasks, Sort and Filter, saved on the project. */
export function DisplayPopover({ display, labels, onChange }: { display: ProjectDisplay; labels: { id: string; name: string }[]; onChange: (change: Partial<ProjectDisplay>) => void }) {
  const changed = displayChanges(display);
  const row = (key: Option, title: string) => {
    const items = key === "label" ? [{ value: "all", label: "All" }, ...labels.map(label => ({ value: label.id, label: label.name }))] : options[key].map(([value, label]) => ({ value: value as string, label }));
    return <div className="flex min-h-control items-center justify-between gap-3">
      <span className="text-sm">{title}</span>
      <Select items={items} value={display[key]} onValueChange={(value) => { if (value) onChange({ [key]: value } as Partial<ProjectDisplay>); }}>
        <SelectTrigger size="sm" aria-label={title} className="w-40" data-display-option={key}><SelectValue /></SelectTrigger>
        <SelectContent>{items.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
      </Select>
    </div>;
  };
  return <Popover>
    <PopoverTrigger render={<Button variant="ghost" data-project-action="display" aria-label={changed ? `Display: ${changed} changed` : "Display"} />}>
      <SlidersHorizontal />{changed ? `Display: ${changed}` : "Display"}
    </PopoverTrigger>
    <PopoverContent align="end" className="w-80 gap-2 p-3">
      <PopoverTitle className="text-xs-plus font-semibold text-muted-foreground">Layout</PopoverTitle>
      <ToggleGroup aria-label="Layout" className="grid w-full grid-cols-4" value={[display.layout]} onValueChange={(next) => { const layout = next[0] as ProjectDisplay["layout"] | undefined; if (layout) onChange({ layout }); }}>
        {layouts.map(([value, label, Icon]) => <ToggleGroupItem key={value} value={value} className="h-auto flex-col gap-1 py-2 text-xs-plus" data-display-layout={value}><Icon className="size-5" />{label}</ToggleGroupItem>)}
      </ToggleGroup>
      {display.layout === "calendar" && <ToggleGroup aria-label="Calendar range" className="grid w-full grid-cols-2" value={[display.calendarRange]} onValueChange={(next) => { const range = next[0] as ProjectDisplay["calendarRange"] | undefined; if (range) onChange({ calendarRange: range }); }}>
        <ToggleGroupItem value="week">Week</ToggleGroupItem><ToggleGroupItem value="month">Month</ToggleGroupItem>
      </ToggleGroup>}
      <Label className="flex min-h-control cursor-pointer items-center justify-between font-normal">Completed tasks<Switch checked={display.showCompleted} onCheckedChange={(showCompleted) => onChange({ showCompleted })} /></Label>
      <p className="mt-1 text-xs-plus font-semibold text-muted-foreground">Sort</p>
      {row("grouping", "Grouping")}{row("sorting", "Sorting")}
      <p className="mt-1 text-xs-plus font-semibold text-muted-foreground">Filter</p>
      {row("date", "Date")}{row("deadline", "Deadline")}{row("created", "Created")}{row("priority", "Priority")}{row("label", "Label")}
      {changed > 0 && <Button variant="ghost" size="sm" className="self-start" onClick={() => onChange({ ...defaultProjectDisplay, layout: display.layout, calendarRange: display.calendarRange })}>Reset all</Button>}
    </PopoverContent>
  </Popover>;
}

/** Click to edit; Escape cancels, blur or ⌘Enter saves. */
function Description({ value, onSave }: { value: string | null; onSave?: (value: string) => Promise<unknown> }) {
  const [draft, setDraft] = useState<string | null>(null);
  if (!onSave) return value ? <p className="mb-3 whitespace-pre-wrap text-sm text-muted-foreground">{value}</p> : null;
  const save = () => { if (draft !== null && draft !== (value ?? "")) void run(() => onSave(draft)); setDraft(null); };
  if (draft === null) return <button type="button" data-project-description="" onClick={() => setDraft(value ?? "")}
    className={cn("mb-3 block w-full rounded-md text-left text-sm whitespace-pre-wrap outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring", value ? "text-muted-foreground" : "text-subtle-foreground")}>
    {value || "Add a description"}
  </button>;
  return <Textarea autoFocus aria-label="Project description" className="mb-3" rows={3} maxLength={DESCRIPTION_MAX} value={draft} placeholder="Add a description"
    onChange={event => setDraft(event.target.value)} onBlur={save}
    onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setDraft(null); } if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) save(); }} />;
}

/** The hover line between sections (and board columns) that adds a section there. */
function AddSectionDivider({ vertical, onAdd }: { vertical?: boolean; onAdd: () => void }) {
  return <div className={cn("ui group/divider flex shrink-0 items-center justify-center", vertical ? "w-4 self-stretch" : "h-4")}>
    <button type="button" onClick={onAdd} aria-label="Add section"
      className={cn("flex items-center gap-1.5 text-xs-plus font-semibold text-brand opacity-0 outline-none group-hover/divider:opacity-100 focus-visible:opacity-100 pointer-coarse:hidden",
        vertical ? "h-full flex-col [writing-mode:vertical-rl]" : "w-full")}>
      <span className={cn("bg-brand", vertical ? "w-px flex-1" : "h-px flex-1")} />Add section<span className={cn("bg-brand", vertical ? "w-px flex-1" : "h-px flex-1")} />
    </button>
  </div>;
}

function SectionForm({ initial = "", submit, onSubmit, onClose, className }: { initial?: string; submit: string; onSubmit: (name: string) => Promise<unknown>; onClose: () => void; className?: string }) {
  const [name, setName] = useState(initial);
  const send = (event: FormEvent) => { event.preventDefault(); if (name.trim()) void run(() => onSubmit(name.trim()), onClose); };
  return <form ref={releaseFocus} aria-label={submit} className={cn("ui flex flex-col gap-2 py-2", className)} onSubmit={send} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
    <Input autoFocus aria-label="Section name" placeholder="Name this section" value={name} onChange={event => setName(event.target.value)} maxLength={200} />
    <div className="flex gap-2"><Button type="submit" size="sm" disabled={!name.trim()}>{submit}</Button><Button type="button" size="sm" variant="secondary" onClick={onClose}>Cancel</Button></div>
  </form>;
}

/** A section's (or the Display group's) title row: fold, name, count and the section's ••• menu. */
function GroupHeader({ title, count, collapsed, onToggle, section, sections, onRename, onAddAfter }: {
  title: string; count: number; collapsed: boolean; onToggle: () => void; section?: SectionDto | null; sections?: SectionActions; onRename?: () => void; onAddAfter?: () => void;
}) {
  return <div className="ui group/header flex min-h-control items-center gap-1 border-b border-border" data-section-id={section?.id}>
    <Button variant="ghost" size="icon-xs" aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`} aria-expanded={!collapsed} onClick={onToggle}>
      <ChevronDown className={cn("transition-transform", collapsed && "-rotate-90")} />
    </Button>
    <span className="min-w-0 truncate text-sm font-bold">{title}</span><span className="text-xs-plus text-muted-foreground tabular-nums">{count}</span>
    {section && sections && <SectionMenu section={section} sections={sections} onRename={onRename} onAddAfter={onAddAfter} className="ml-auto" />}
  </div>;
}

function SectionMenu({ section, sections, onRename, onAddAfter, className }: { section: SectionDto; sections: SectionActions; onRename?: () => void; onAddAfter?: () => void; className?: string }) {
  return <DropdownMenu>
    <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label={`More actions for section ${section.name}`} className={cn("opacity-0 group-hover/header:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100 pointer-coarse:opacity-100", className)} />}><Ellipsis /></DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="min-w-44">
      {onRename && <DropdownMenuItem onClick={onRename}><Pencil />Edit</DropdownMenuItem>}
      {onAddAfter && <DropdownMenuItem onClick={onAddAfter}><Plus />Add section</DropdownMenuItem>}
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" onClick={() => sections.remove(section)}><Trash2 />Delete</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}

const priorityRing: Record<number, string> = { 1: "border-priority-1 bg-priority-1/10", 2: "border-priority-2 bg-priority-2/10", 3: "border-priority-3 bg-priority-3/10", 4: "border-priority-4" };
/** A Todoist round task checkbox in the priority's colour. */
function Circle({ task, actions }: { task: TaskDto; actions?: RowActions }) {
  const done = task.status === "done";
  const className = cn("mt-0.5 flex size-4.5 shrink-0 items-center justify-center rounded-full border", priorityRing[task.priority], done && "border-muted-foreground bg-muted-foreground");
  return actions ? <button type="button" role="checkbox" aria-checked={done} aria-label={`Complete ${task.title}`} className={className} onClick={() => actions.complete(task)} />
    : <span className={className} aria-hidden="true" />;
}

/** The row's hover tools (Todoist): edit, date, comment, and the task menu. */
function RowTools({ task, dates }: { task: TaskDto; dates?: DateActions }) {
  const dialog = useContext(TaskDialogs);
  if (!dialog) return null;
  const more = (event: MouseEvent<HTMLButtonElement>) => {
    const { left, bottom } = event.currentTarget.getBoundingClientRect();
    event.currentTarget.closest("[data-task-id]")?.dispatchEvent(new window.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: left, clientY: bottom, button: 2 }));
  };
  return <span className="flex shrink-0 items-start opacity-0 group-hover/task:opacity-100 group-focus-within/task:opacity-100 pointer-coarse:hidden" data-row-tools="">
    <Button variant="ghost" size="icon-xs" aria-label={`Edit ${task.title}`} title="Edit" onClick={() => (dialog.edit ?? dialog.open)(task.id)}><Pencil /></Button>
    {dates && <Popover>
      <PopoverTrigger render={<Button variant="ghost" size="icon-xs" aria-label={`Set date for ${task.title}`} title="Set date" />}><CalendarDays /></PopoverTrigger>
      <PopoverContent align="end" className="w-56 gap-2 p-2">
        <PopoverTitle className="text-xs-plus font-semibold text-muted-foreground">Date</PopoverTitle>
        <DayInput label={`Date for ${task.title}`} value={task.dueDate} onChange={(day) => dates.due(task, day)} />
      </PopoverContent>
    </Popover>}
    <Button variant="ghost" size="icon-xs" aria-label={`Comment on ${task.title}`} title="Comment" onClick={() => dialog.open(task.id)}><MessageSquare /></Button>
    <Button variant="ghost" size="icon-xs" aria-label={`More actions for ${task.title}`} title="More actions" onClick={more}><Ellipsis /></Button>
  </span>;
}

function DayInput({ label, value, onChange, className }: { label: string; value: string | null; onChange: (day: string | null) => void; className?: string }) {
  return <Input type="date" aria-label={label} className={cn("h-control-sm text-xs-plus", className)} value={dateInputValue(value)} onChange={event => onChange(event.target.value || null)} />;
}

type Group = { key: string; title: string; section: SectionDto | null | undefined; tasks: TaskDto[] };
interface Body {
  project: ProjectDto; groups: Group[]; all: TaskDto[]; sectioned: boolean; manual: boolean; now: Date; collapsed: Set<string>; toggle: (key: string) => void;
  sections?: SectionActions; onCreate?: (task: NewTask) => Promise<unknown>; actions?: RowActions; dates?: DateActions; selection?: SelectionSlots;
  reorder?: (task: TaskDto, anchorId: string, position: ReorderPosition) => void; move?: (task: TaskDto, sectionId: string | null) => void;
  adding: string | null | undefined; setAdding: (after: string | null | undefined) => void; renaming: string | null; setRenaming: (id: string | null) => void;
}
/** `adding`: undefined closed, null first, an ID after that section, "" last. */
const LAST = "";

function newSection(body: Body, after: string | null, vertical = false) {
  if (!body.sections) return null;
  if (body.adding === after) return <SectionForm submit="Add section" className={vertical ? "w-72 shrink-0" : undefined} onClose={() => body.setAdding(undefined)}
    onSubmit={(name) => body.sections!.create(name, after === LAST ? undefined : after)} />;
  return <AddSectionDivider vertical={vertical} onAdd={() => body.setAdding(after)} />;
}

function composer(body: Body, group: Group) {
  if (!body.sectioned) return null;
  return body.onCreate
    ? <Composer dueDate={() => null} projectId={body.project.id} sectionId={group.section?.id ?? null} placement={{ edge: "bottom" }} onCreate={body.onCreate} />
    : <span className="composer" aria-disabled="true"><Plus />Add task</span>;
}

function header(body: Body, group: Group) {
  const section = group.section;
  if (section && body.renaming === section.id && body.sections)
    return <SectionForm initial={section.name} submit="Save" onClose={() => body.setRenaming(null)} onSubmit={(name) => body.sections!.rename(section, name)} />;
  return <GroupHeader title={group.title} count={group.tasks.length} collapsed={body.collapsed.has(group.key)} onToggle={() => body.toggle(group.key)}
    section={section} sections={body.sections} onRename={section ? () => body.setRenaming(section.id) : undefined} onAddAfter={section ? () => body.setAdding(section.id) : undefined} />;
}

function ProjectList(body: Body) {
  const { groups, all, now, project, actions, selection, reorder, manual, sectioned } = body;
  const tree = listTree(all);
  const row = (task: TaskDto) => <TaskRow key={task.id} task={task} now={now} projectName={project.name} actions={actions} selection={selection?.row(task)} tools={<RowTools task={task} dates={body.dates} />} {...tree(task)} />;
  return <div className="sections">
    {sectioned && newSection(body, null)}
    {groups.map(group => {
      // Todoist: unsectioned tasks lead without a heading.
      const headed = !(sectioned && group.section === null);
      if (sectioned && group.section === null && group.tasks.length === 0 && !body.onCreate) return null;
      const open = !headed || !body.collapsed.has(group.key);
      return <section key={group.key} id={group.section ? `section-${group.section.id}` : undefined} tabIndex={group.section ? -1 : undefined}>
        {headed && header(body, group)}
        {open && <>
          {reorder && manual && sectioned && group.tasks.length > 0
            ? <SortableTasks ids={group.tasks.map(task => task.id)} label={(id) => group.tasks.find(task => task.id === id)?.title ?? "task"} onReorder={(id, overId, position) => {
              const task = group.tasks.find(item => item.id === id); const anchorId = reorderAnchor(all, id, overId);
              if (task && anchorId) reorder(task, anchorId, position);
            }}>{group.tasks.map(task => <SortableRow key={task.id} id={task.id} title={task.title}>{row(task)}</SortableRow>)}</SortableTasks>
            : group.tasks.map(row)}
          {composer(body, group)}
        </>}
        {sectioned && newSection(body, group.section?.id ?? null)}
      </section>;
    })}
    {all.length === 0 && <p className="state">{sectioned ? "No open tasks in this project." : "No tasks match this Display."}</p>}
  </div>;
}

const columnKey = (id: string) => `column:${id}`;
// The card under the pointer wins over its column; keyboard drags take the nearest corners.
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  const cards = hits.filter(hit => !String(hit.id).startsWith("column:"));
  return cards.length ? cards : hits.length ? hits : closestCorners(args);
};

function BoardColumn({ id, children }: { id: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: columnKey(id) });
  return <div ref={setNodeRef} className={cn("flex min-h-16 flex-col gap-2 rounded-xl", isOver && "bg-accent")}>{children}</div>;
}

/** A board card: rounded, with its date, labels count and sub-tasks ("2/3 ⌄" opens them inside the card). */
function BoardCard({ task, subtasks, body }: { task: TaskDto; subtasks: TaskDto[]; body: Body }) {
  const dialog = useContext(TaskDialogs);
  const [open, setOpen] = useState(false);
  const done = subtasks.filter(item => item.status === "done").length;
  const date = shortDateLabel(task, body.now);
  return <div className="ui group/task flex flex-col gap-1 rounded-xl border border-border bg-background p-2.5 shadow-xs hover:shadow-sm" data-task-id={task.id} data-done={task.status === "done" || undefined}>
    <div className="flex items-start gap-2">
      <Circle task={task} actions={body.actions} />
      <button type="button" className={cn("min-w-0 flex-1 text-left text-sm [overflow-wrap:anywhere]", task.status === "done" && "text-muted-foreground line-through")} onClick={() => dialog?.open(task.id)}>{task.title}</button>
      <RowTools task={task} dates={body.dates} />
    </div>
    {task.description && <p className="line-clamp-2 pl-6.5 text-xs-plus text-muted-foreground">{task.description}</p>}
    {(date || subtasks.length > 0) && <div className="flex flex-wrap items-center gap-2 pl-6.5 text-xs-plus text-muted-foreground">
      {date && <span className="flex items-center gap-1"><CalendarDays className="size-3.5" />{date}</span>}
      {subtasks.length > 0 && <button type="button" className="flex items-center gap-1 rounded-md px-1 hover:bg-accent" aria-expanded={open} aria-label={`Sub-tasks ${done} of ${subtasks.length} done, ${open ? "hide" : "show"}`} onClick={() => setOpen(value => !value)}>
        <GitBranch className="size-3.5" />{done}/{subtasks.length}<ChevronDown className={cn("size-3.5 transition-transform", !open && "-rotate-90")} />
      </button>}
    </div>}
    {open && <div className="mt-1 flex flex-col gap-1.5 border-t border-border-subtle pt-2 pl-6.5">
      {subtasks.map(child => <div key={child.id} className="flex items-start gap-2" data-task-id={child.id}>
        <Circle task={child} actions={body.actions} />
        <button type="button" className={cn("min-w-0 flex-1 text-left text-xs-plus", child.status === "done" && "text-muted-foreground line-through")} onClick={() => dialog?.open(child.id)}>{child.title}</button>
      </div>)}
    </div>}
  </div>;
}

/** Todoist's board: a column per section (and "(No section)"), cards dragged within and between them. */
function ProjectBoard(body: Body) {
  const { groups, all, sectioned, manual, move, reorder } = body;
  const sensors = useDragSensors();
  const [active, setActive] = useState<string | null>(null);
  const ids = new Set(all.map(task => task.id));
  // Cards are top-level tasks of the board; sub-tasks open inside their card.
  const cardsOf = (group: Group) => group.tasks.filter(task => !task.parentId || !ids.has(task.parentId));
  const subtasksOf = (task: TaskDto) => treeOrder(all.filter(item => item.parentId === task.id));
  const groupOf = (id: string) => id.startsWith("column:") ? groups.find(group => columnKey(group.key) === id) : groups.find(group => group.tasks.some(task => task.id === id));
  const draggable = sectioned && manual && Boolean(move || reorder);
  function end({ active: dragged, over }: DragEndEvent) {
    setActive(null);
    const task = all.find(item => item.id === dragged.id);
    const target = over && groupOf(String(over.id));
    if (!task || !target) return;
    const sectionId = target.section?.id ?? null;
    if (sectionId !== (groupOf(task.id)?.section?.id ?? null)) { move?.(task, sectionId); return; }
    const cards = cardsOf(target);
    const overId = String(over.id);
    const anchorId = reorderAnchor(all, task.id, overId);
    if (anchorId && reorder) reorder(task, anchorId, cards.findIndex(card => card.id === task.id) < cards.findIndex(card => card.id === overId) ? "after" : "before");
  }
  const label = (id: string) => groupOf(id)?.title && id.startsWith("column:") ? groupOf(id)!.title : all.find(task => task.id === id)?.title ?? "task";
  const shown = groups.filter(group => !(sectioned && group.section === null && group.tasks.length === 0));
  const dragged = all.find(task => task.id === active);
  return <DndContext sensors={sensors} collisionDetection={collision} accessibility={{ announcements: dragAnnouncements(label) }}
    onDragStart={({ active: start }) => setActive(String(start.id))} onDragCancel={() => setActive(null)} onDragEnd={end}>
    <div className="-mx-2 flex items-start overflow-x-auto px-2 pb-4" aria-label="Board view" data-board="sections">
      {sectioned && newSection(body, null, true)}
      {shown.map(group => {
        const cards = cardsOf(group);
        return <div key={group.key} className="flex shrink-0 items-stretch">
          <section className="flex w-72 shrink-0 flex-col gap-2" aria-label={group.title} data-board-column={group.section?.id ?? "none"}>
            {group.section && body.renaming === group.section.id && body.sections
              ? <SectionForm initial={group.section.name} submit="Save" onClose={() => body.setRenaming(null)} onSubmit={(name) => body.sections!.rename(group.section!, name)} />
              : <div className="ui group/header flex min-h-control items-center gap-1.5 px-1">
                <span className="min-w-0 truncate text-sm font-bold">{group.title}</span><span className="text-xs-plus text-muted-foreground tabular-nums">{cards.length}</span>
                {group.section && body.sections && <SectionMenu section={group.section} sections={body.sections} className="ml-auto"
                  onRename={() => body.setRenaming(group.section!.id)} onAddAfter={() => body.setAdding(group.section!.id)} />}
              </div>}
            <BoardColumn id={group.key}>
              <SortableContext items={cards.map(task => task.id)} strategy={verticalListSortingStrategy}>
                {cards.map(task => draggable
                  ? <SortableRow key={task.id} id={task.id} title={task.title} className="group/card relative" handleClassName="ui absolute top-3 -left-3 z-10 text-muted-foreground opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100 [&_svg]:size-3.5">
                    <BoardCard task={task} subtasks={subtasksOf(task)} body={body} />
                  </SortableRow>
                  : <BoardCard key={task.id} task={task} subtasks={subtasksOf(task)} body={body} />)}
              </SortableContext>
              {composer(body, group)}
            </BoardColumn>
          </section>
          {sectioned && newSection(body, group.section?.id ?? null, true)}
        </div>;
      })}
      {sectioned && body.sections && (body.adding === LAST ? newSection(body, LAST, true)
        : <Button variant="ghost" className="ui w-72 shrink-0 justify-start text-muted-foreground" onClick={() => body.setAdding(LAST)}><Plus />Add section</Button>)}
    </div>
    <DragOverlay dropAnimation={null}>{dragged && <div className="w-72 rotate-2"><BoardCard task={dragged} subtasks={subtasksOf(dragged)} body={body} /></div>}</DragOverlay>
  </DndContext>;
}

/** Todoist's table: Task, Date and Deadline (editable in place), grouped by section. */
function ProjectTable(body: Body) {
  const { groups, all, now, sectioned } = body;
  const dialog = useContext(TaskDialogs);
  const tree = listTree(all);
  const columns = <colgroup><col /><col className="w-40" /><col className="w-40" /></colgroup>;
  return <div className="flex flex-col" aria-label="Table view" data-table="project">
    <Table className="table-fixed">{columns}<TableHeader><TableRow><TableHead>Task</TableHead><TableHead>Date</TableHead><TableHead>Deadline</TableHead></TableRow></TableHeader></Table>
    {sectioned && newSection(body, null)}
    {groups.map(group => {
      const headed = !(sectioned && group.section === null);
      if (sectioned && group.section === null && group.tasks.length === 0 && !body.onCreate) return null;
      const open = !headed || !body.collapsed.has(group.key);
      return <section key={group.key} aria-label={group.title}>
        {headed && <div className="pt-3">{header(body, group)}</div>}
        {open && group.tasks.length > 0 && <Table className="table-fixed">{columns}<TableBody>
          {group.tasks.map(task => <TableRow key={task.id} className="group/task" data-task-id={task.id}>
            <TableCell><div className="flex items-start gap-2" style={{ paddingLeft: `${tree(task).depth * 1.5}rem` }}>
              <Circle task={task} actions={body.actions} />
              <button type="button" className={cn("min-w-0 flex-1 truncate text-left", task.status === "done" && "text-muted-foreground line-through")} onClick={() => dialog?.open(task.id)}>{task.title}</button>
            </div></TableCell>
            <TableCell>{body.dates ? <DayInput label={`Date for ${task.title}`} value={task.dueDate} onChange={(day) => body.dates!.due(task, day)} /> : shortDateLabel(task, now)}</TableCell>
            <TableCell>{body.dates ? <DayInput label={`Deadline for ${task.title}`} value={task.deadline} onChange={(day) => body.dates!.deadline(task, day)} /> : task.deadline && dateInputValue(task.deadline)}</TableCell>
          </TableRow>)}
        </TableBody></Table>}
        {open && composer(body, group)}
        {sectioned && newSection(body, group.section?.id ?? null)}
      </section>;
    })}
  </div>;
}

export function ProjectView({ state, onRetry, write, project: projectActions, sections, display = defaultProjectDisplay, labels = [], calendar, files, goals, now = new Date(), selection, reorder, move, onCreate, actions, dates }: {
  state: ReadState<ProjectDetailDto | null>; onRetry: () => void; write: Write;
  /** Edit, favorite, archive, delete, copy link, description and Display; absent, the page is read-only. */
  project?: ProjectActions;
  sections?: SectionActions;
  /** The project's saved Display settings. */
  display?: ProjectDisplay;
  /** The user's labels, for Display's Label filter and grouping. */
  labels?: { id: string; name: string }[];
  /** The Calendar layout over the shown tasks (the shared calendar). */
  calendar?: (tasks: TaskDto[]) => ReactNode;
  files?: ReactNode;
  /** Goals ticket 02: the Goals picker in the header (absent while Goals is hidden). */
  goals?: ReactNode;
  now?: Date;
  /** Ticket 15: selection and bulk toolbar (list layout). */
  selection?: SelectionSlots;
  /** Manual order: drag or keyboard within a section, and a board card into another section. */
  reorder?: (task: TaskDto, anchorId: string, position: ReorderPosition) => void;
  move?: (task: TaskDto, sectionId: string | null) => void;
  onCreate?: (task: NewTask) => Promise<unknown>;
  actions?: RowActions;
  dates?: DateActions;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<string | null | undefined>(undefined);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Toggle nested (keyboard-screens.tsx) folds or unfolds every section, as legacy "todalo:toggle-sections".
  const sectionIds = (state.data?.sections ?? []).map(section => section.id).join(" ");
  useEffect(() => {
    const toggle = () => setCollapsed(current => current.size ? new Set() : new Set(sectionIds.split(" ").filter(Boolean)));
    window.addEventListener("todalo:toggle-sections", toggle);
    return () => window.removeEventListener("todalo:toggle-sections", toggle);
  }, [sectionIds]);
  if (state.status === "pending" && !state.data) return <p className="state" role="status">Loading project…</p>;
  if (state.status === "error" && !state.data) return <Failure error={state.error} onRetry={onRetry} />;
  if (!state.data) return <div><h1 className="page-title">Project not found</h1><p className="state">This project does not exist or you do not have access to it.</p><Link className="text-action" to="/projects">Back to My Projects</Link></div>;
  const { project, tasks, sections: sectionList = [] } = state.data;
  const shown = treeOrder(sortProjectTasks(filterProjectTasks(tasks, display, now), display.sorting));
  const sectioned = display.grouping === "none";
  const groups: Group[] = display.grouping === "none"
    ? sectionGroups(sectionList, shown).map(({ section, tasks: grouped }) => ({ key: section?.id ?? "none", title: section?.name ?? "(No section)", section, tasks: grouped }))
    : groupProjectTasks(shown, display.grouping, labels, now).map(group => ({ ...group, section: undefined }));
  const toggle = (key: string) => setCollapsed(current => { const next = new Set(current); if (!next.delete(key)) next.add(key); return next; });
  const body: Body = {
    project, groups, all: shown, sectioned, manual: display.sorting === "manual", now, collapsed, toggle, sections, onCreate, actions, dates, selection, reorder, move,
    adding, setAdding, renaming, setRenaming,
  };
  const change = (next: Partial<ProjectDisplay>) => projectActions && void run(() => projectActions.update({ display: { ...display, ...next } }));
  const layout = display.layout;
  return <div data-project-id={project.id}>
    <div className="ui mb-2 flex min-h-control items-center gap-2">
      <Breadcrumb className="min-w-0 flex-1"><BreadcrumbList><BreadcrumbItem><BreadcrumbLink render={<Link to="/projects" />}>My Projects</BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator /></BreadcrumbList></Breadcrumb>
      {layout === "list" && selection?.control}
      {goals}
      <DisplayPopover display={display} labels={labels} onChange={change} />
      {projectActions && <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="More project actions" data-project-action="menu" />}><Ellipsis /></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuItem onClick={() => setEditing(true)}><Pencil />Edit</DropdownMenuItem>
          <DropdownMenuItem onClick={() => void run(() => projectActions.update({ favorite: !project.favorite }))}><Heart />{project.favorite ? "Remove from favorites" : "Add to favorites"}</DropdownMenuItem>
          <DropdownMenuSeparator />
          {sections && <DropdownMenuItem onClick={() => setAdding(LAST)}><Plus />Add section<DropdownMenuShortcut>S</DropdownMenuShortcut></DropdownMenuItem>}
          <DropdownMenuItem onClick={projectActions.copyLink}><Link2 />Copy link to project<DropdownMenuShortcut>⇧⌘C</DropdownMenuShortcut></DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => void run(() => projectActions.update({ archived: !project.archived }))}>{project.archived ? <><ArchiveRestore />Unarchive</> : <><Archive />Archive</>}</DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => setDeleting(true)}><Trash2 />Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>}
      {/* Keyboard commands (keyboard-screens.tsx): S adds a section, ⇧⌘C copies the link, the sort keys pick Sorting. */}
      {sections && <button type="button" hidden data-project-action="section" onClick={() => setAdding(LAST)}>Add section</button>}
      {projectActions && <button type="button" hidden data-project-action="copy-link" onClick={projectActions.copyLink}>Copy link to project</button>}
      {projectActions && (["date", "name", "priority"] as const).map(sorting => <button key={sorting} type="button" hidden data-project-sort={sorting} onClick={() => change({ sorting })}>Sort by {sorting}</button>)}
    </div>
    <div className="ui">
      <PageHeader title={project.name} className="mb-1" />
      {project.archived && <div className="mb-3 flex items-center gap-3 rounded-lg border border-border bg-muted px-3 py-2 text-sm" role="status">
        <Archive className="text-muted-foreground" />This project is archived.
        {projectActions && <Button size="sm" variant="secondary" className="ml-auto" onClick={() => void run(() => projectActions.update({ archived: false }))}>Unarchive</Button>}
      </div>}
      <Description value={project.description} onSave={projectActions && ((description) => projectActions.update({ description }))} />
      {write.error && <FormError>{write.error}</FormError>}
    </div>
    {layout === "list" && selection?.toolbar}
    {files}
    {layout === "calendar" && calendar ? calendar(shown)
      : layout === "board" ? <ProjectBoard {...body} />
      : layout === "table" ? <ProjectTable {...body} />
      : <ProjectList {...body} />}
    {sectioned && adding === LAST && layout !== "board" && sections && <SectionForm submit="Add section" onClose={() => setAdding(undefined)} onSubmit={(name) => sections.create(name)} />}
    {editing && projectActions && <ProjectDialog project={project} write={write} onClose={() => setEditing(false)} onSave={(fields) => void run(() => projectActions.update(fields), () => setEditing(false))} />}
    {projectActions && <DeleteProjectDialog project={deleting ? project : null} pending={write.pending} onClose={() => setDeleting(false)} onDelete={() => { setDeleting(false); projectActions.remove(); }} />}
  </div>;
}

