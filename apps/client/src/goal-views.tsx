import { useState, type FormEvent, type ReactNode } from "react";
import { Link, NavLink } from "react-router";
import {
  Apple, Baby, Bike, BookOpen, Brain, Briefcase, CalendarRange, Camera, Code, Dog, Dumbbell, Flame, Footprints, GraduationCap, Hash, Heart, House, Leaf,
  Moon, Mountain, Music, Palette, Pencil, PenTool, PiggyBank, Plane, Plus, Rocket, Star, Sun, Target, Trophy, Users, Wallet, X, type LucideIcon,
} from "lucide-react";
import { criteriaProgress, goalColorKeys, goalColorValue, goalIcons, type GoalColor, type GoalIcon as GoalIconName, type GoalDetailDto, type GoalDto, type GoalLinkKind, type GoalPatch, type MilestoneDto } from "./goals";
import type { SeasonTier } from "./seasons";
import { taskPath } from "./links";
import type { ReorderPosition } from "./bulk";
import { SortableRow, SortableTasks } from "./bulk-views";
import { MilestoneMark, type ReadState } from "./views";
import { releaseFocus } from "./software-keyboard";
import {
  Alert, AlertDescription, AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, Badge, Button, Card, CardContent, Checkbox, Field, FieldLabel, FieldLegend, FieldSet, Hint, Input, Label, List,
  ListRow, PageHeader, PageSection, Popover, PopoverContent, PopoverTitle, PopoverTrigger, Select, SelectContent, SelectItem, SelectTrigger,
  SelectValue, SidebarSectionHeader, Spinner, SwatchPicker, Switch, Textarea, ToggleGroup, ToggleGroupItem, cn, sidebarItemClassName, type Swatch,
} from "./ui";

// Pure goal views (goals ticket 01): no runtime imports. Built only from src/ui (docs/agents/ui.md).
type Write = { pending: boolean; error: string | null };

/** Ticket 14c: the curated goal icons (goal-dto `goalIcons`) as lucide components. */
const iconComponents: Record<GoalIconName, LucideIcon> = {
  target: Target, rocket: Rocket, dumbbell: Dumbbell, "book-open": BookOpen, heart: Heart, briefcase: Briefcase, "graduation-cap": GraduationCap,
  "piggy-bank": PiggyBank, music: Music, plane: Plane, leaf: Leaf, code: Code, home: House, brain: Brain, bike: Bike, footprints: Footprints,
  apple: Apple, moon: Moon, sun: Sun, palette: Palette, camera: Camera, "pen-tool": PenTool, users: Users, baby: Baby, dog: Dog, trophy: Trophy,
  star: Star, flame: Flame, mountain: Mountain, wallet: Wallet,
};
const iconLabel = (icon: string) => icon.split("-").map(word => word[0]!.toUpperCase() + word.slice(1)).join(" ");
// Important sizes and colour on the glyph: sidebar rows and buttons style every svg inside them.
const iconSizes = {
  xs: ["size-3.5 rounded-xs", "size-2.5!"], sm: ["size-4 rounded-sm", "size-3!"], md: ["size-5 rounded-md", "size-3.5!"], lg: ["size-7 rounded-lg", "size-4.5!"],
} as const;

/** Ticket 14c: a goal's identity everywhere it shows: its icon in white on a rounded square of its colour. */
export const GoalIcon = ({ color, icon, size = "sm", className }: { color: string; icon?: string; size?: keyof typeof iconSizes; className?: string }) => {
  const Icon = iconComponents[icon as GoalIconName] ?? Target;
  return <span data-slot="goal-icon" aria-hidden="true" className={cn("inline-grid shrink-0 place-content-center", iconSizes[size][0], className)}
    style={{ background: goalColorValue(color) }}><Icon strokeWidth={2.5} className={cn(iconSizes[size][1], "text-primary-foreground! opacity-100!")} /></span>;
};

/** The curated icons as a toggle grid (arrow keys move, Space picks), shown in the goal's colour. */
export function IconPicker({ value, color, onChange }: { value: GoalIconName; color: GoalColor; onChange(icon: GoalIconName): void }) {
  return <FieldSet className="gap-2"><FieldLegend variant="label">Icon</FieldLegend>
    <ToggleGroup aria-label="Icon" spacing={1} className="flex-wrap" value={[value]} onValueChange={(next) => { const icon = next[0] as GoalIconName | undefined; if (icon) onChange(icon); }}>
      {goalIcons.map(icon => <ToggleGroupItem key={icon} value={icon} size="sm" aria-label={iconLabel(icon)} title={iconLabel(icon)} className="size-control-sm p-0 data-[pressed]:bg-selected">
        <GoalIcon color={value === icon ? color : "slate"} icon={icon} size="md" />
      </ToggleGroupItem>)}
    </ToggleGroup>
  </FieldSet>;
}

const colorNames: Record<GoalColor, string> = { blue: "Blue", green: "Green", orange: "Orange", violet: "Violet", pink: "Pink", teal: "Teal", amber: "Amber", red: "Red", indigo: "Indigo", slate: "Slate" };
export const goalSwatches: Swatch<GoalColor>[] = goalColorKeys.map(color => ({ value: color, label: colorNames[color], color: goalColorValue(color) }));

/** The fixed palette as radio swatches (arrow keys move between them). */
export function ColorPicker({ value, onChange }: { value: GoalColor; onChange(color: GoalColor): void }) {
  return <FieldSet className="gap-2"><FieldLegend variant="label">Colour</FieldLegend>
    <SwatchPicker aria-label="Colour" swatches={goalSwatches} value={value} onValueChange={onChange} />
  </FieldSet>;
}

/** A form-level error line. */
export const FormError = ({ children }: { children: ReactNode }) => <p role="alert" className="text-xs-plus text-destructive">{children}</p>;
/** Loading and load-failure states for a page. */
export const Loading = ({ children }: { children: ReactNode }) => <p role="status" className="flex items-center gap-2 text-muted-foreground"><Spinner />{children}</p>;
export function LoadFailure({ error, onRetry }: { error: Error | null; onRetry: () => void }) {
  return <Alert variant="destructive"><AlertDescription className="flex flex-wrap items-center gap-2">
    <span>{error?.message ?? "This could not be loaded."}</span><Button size="sm" variant="outline" onClick={onRetry}>Try again</Button>
  </AlertDescription></Alert>;
}

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
  return <section className="ui mb-3 flex flex-col" aria-label="Goals">
    <SidebarSectionHeader title="Goals" action={<Button variant="ghost" size="icon-sm" aria-label="Add goal" aria-expanded={adding} data-goal-action="create" onClick={() => onAdding(!adding)}><Plus /></Button>} />
    {adding && <form className="flex gap-1.5 px-1 py-1" onSubmit={submit} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onAdding(false); } }}>
      <Input aria-label="New goal title" placeholder="New goal" autoFocus value={title} onChange={event => setTitle(event.target.value)} required maxLength={200} />
      <Button type="submit" disabled={write.pending || !title.trim()}>Add</Button>
    </form>}
    {write.error && <div className="px-2"><FormError>{write.error}</FormError></div>}
    <SortableTasks ids={goals.map(goal => goal.id)} label={(id) => goals.find(goal => goal.id === id)?.title ?? "goal"} onReorder={onReorder}>
      {goals.map(goal => <SortableRow key={goal.id} id={goal.id} title={goal.title} className="group/row -ml-6 flex items-center"
        handleClassName="inline-flex size-6 shrink-0 cursor-grab items-center justify-center rounded-md text-subtle-foreground opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 [&_svg]:size-3.5">
        <NavLink to={`/goals/${encodeURIComponent(goal.id)}`} className={sidebarItemClassName}><GoalIcon color={goal.color} icon={goal.icon} /><span className="truncate">{goal.title}</span></NavLink>
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
  return <p className="ui col-span-full flex items-center gap-1.5 pt-1 text-xs-plus text-muted-foreground" data-goal-suggestion={goal.id}>
    <Target className="size-3.5" /><span className="min-w-0 [overflow-wrap:anywhere]">Suggested: {goal.title}</span>
    <Button variant="link" size="xs" data-suggestion="accept" onClick={() => slots.onToggle(goal.id, true)}>Link</Button>
    <Button variant="ghost" size="icon-xs" data-suggestion="dismiss" aria-label={`Dismiss suggestion ${goal.title}`} title="Dismiss" onClick={() => slots.onDismiss?.(goal.id)}><X /></Button>
  </p>;
}

/** A goal as a chip: its colour dot and title. */
export const GoalChip = ({ goal }: { goal: Pick<GoalDto, "color" | "icon" | "title"> }) =>
  <Badge variant="outline" className="h-6 max-w-full gap-1.5 pr-2 pl-1 text-xs-plus font-normal"><GoalIcon color={goal.color} icon={goal.icon} /><span className="truncate">{goal.title}</span></Badge>;

/**
 * Checkboxes over the active goals; each tick links or unlinks at once.
 * `property` is the task sheet's chip row, `button` the project header's button.
 */
export function GoalPicker({ slots, variant, data }: { slots: GoalSlots; variant: "property" | "button"; data?: Partial<Record<`data-${string}`, string>> }) {
  const chosen = slots.goals.filter(goal => slots.linked.includes(goal.id));
  const label = chosen.length ? `Goals: ${chosen.map(goal => goal.title).join(", ")}` : "Link goals";
  const trigger = variant === "button"
    ? <Button variant="outline" aria-label={label} {...data}><Target />{chosen.length ? `Goals · ${chosen.length}` : "Goals"}</Button>
    : chosen.length
      ? <button type="button" aria-label={label} className="ui flex min-w-0 flex-wrap gap-1 rounded-lg p-0.5 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring" {...data}>{chosen.map(goal => <GoalChip key={goal.id} goal={goal} />)}</button>
      : <Button variant="ghost" size="icon-sm" aria-label={label} {...data}><Plus /></Button>;
  return <>
    <Popover>
      <PopoverTrigger render={trigger} />
      <PopoverContent align="start" className="w-64 gap-1 p-2">
        <PopoverTitle className="px-1.5 pb-1 text-xs-plus font-semibold text-muted-foreground">Goals</PopoverTitle>
        {slots.goals.length > 0 ? <div role="group" aria-label="Goals" className="flex flex-col">{slots.goals.map(goal => <Label key={goal.id} className="flex h-control cursor-pointer items-center gap-2 rounded-lg px-1.5 text-sm font-normal hover:bg-accent">
          <Checkbox checked={slots.linked.includes(goal.id)} onCheckedChange={(checked) => slots.onToggle(goal.id, checked)} /><GoalIcon color={goal.color} icon={goal.icon} /><span className="truncate">{goal.title}</span>
        </Label>)}</div>
          : <Hint className="px-1.5">Create a goal with + next to Goals in the sidebar.</Hint>}
      </PopoverContent>
    </Popover>
    {slots.error && <FormError>{slots.error}</FormError>}
  </>;
}

/** Ticket 06: the task sheet's milestone, for one of the task's linked goals. Every change saves at once. */
export interface MilestoneSlots {
  /** The task's linked, active goals (a milestone needs a link); empty explains that. */
  goals: GoalDto[]; milestone: MilestoneDto | null; onChange(milestone: MilestoneDto | null): void; error: string | null;
}

/**
 * The task sheet's Milestone property: a switch (for the only linked goal, or
 * the first, with a picker when there are more). The done criteria are the
 * sheet's Done criteria section.
 */
export function MilestoneToggle({ slots }: { slots: MilestoneSlots }) {
  const { goals, milestone } = slots;
  const goal = milestone && goals.find(item => item.id === milestone.goalId);
  const unlinked = !goals.length && !milestone;
  return <div className="ui flex flex-col items-start gap-1.5">
    <Label className={cn("flex min-h-control-sm cursor-pointer items-center gap-2 font-normal", unlinked && "cursor-default text-muted-foreground")}>
      <Switch data-field="milestone" checked={Boolean(milestone)} disabled={unlinked}
        onCheckedChange={(checked) => slots.onChange(checked ? { goalId: goals[0]!.id, criteria: [] } : null)} />
      <span>{milestone ? "Milestone" : "Not a milestone"}</span>
    </Label>
    {unlinked && <Hint>Link this task to a goal first; a milestone marks progress toward one.</Hint>}
    {milestone && goals.length > 1 && <Select items={goals.map(item => ({ value: item.id, label: item.title }))} value={milestone.goalId}
      onValueChange={(goalId) => { if (goalId) slots.onChange({ ...milestone, goalId: goalId as string }); }}>
      <SelectTrigger size="sm" aria-label="Milestone for" className="max-w-full"><SelectValue /></SelectTrigger>
      <SelectContent>{goals.map(item => <SelectItem key={item.id} value={item.id}><GoalIcon color={item.color} icon={item.icon} />{item.title}</SelectItem>)}</SelectContent>
    </Select>}
    {milestone && goals.length <= 1 && goal && <Hint className="flex items-center gap-1.5"><GoalIcon color={goal.color} icon={goal.icon} size="xs" />for {goal.title}</Hint>}
    {slots.error && <FormError>{slots.error}</FormError>}
  </div>;
}

/** The confirm for completing a milestone with open done criteria (native confirm() is unreliable in iOS WKWebView). */
export function CriteriaConfirm({ onAnswer }: { onAnswer(confirmed: boolean): void }) {
  return <AlertDialog open onOpenChange={(open) => { if (!open) onAnswer(false); }}>
    <AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>Complete milestone</AlertDialogTitle>
        <AlertDialogDescription>This milestone has open done criteria. Complete it and tick them all?</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel onClick={() => onAnswer(false)}>Cancel</AlertDialogCancel>
        <AlertDialogAction autoFocus onClick={() => onAnswer(true)}>Complete and tick all</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}

/** The goal's place in the current season (null when it is not in one). */
export interface GoalSeason { tier: SeasonTier; target: string }

/** A season target with its label, so it never reads as the goal's description. */
export const SeasonTarget = ({ text, className }: { text: string; className?: string }) => <p data-slot="season-target" className={cn("text-sm text-muted-foreground [overflow-wrap:anywhere] whitespace-pre-wrap", className)}>
  <span className="mr-1.5 text-2xs font-semibold tracking-wide text-subtle-foreground uppercase">Target</span>{text}
</p>;

const linkClass = "inline-flex min-w-0 items-center gap-2 [overflow-wrap:anywhere] hover:underline hover:decoration-border-hover hover:underline-offset-4 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-subtle-foreground";

/**
 * A goal's page: title, colour and description, edited in place; archiving
 * keeps its data. Shows its season target (that lives on the season, not the
 * goal) and lists its milestones and linked projects and tasks.
 */
export function GoalView({ state, season, onRetry, onSave, onArchive, onUnlink, write }: {
  state: ReadState<GoalDetailDto | null>; season?: GoalSeason | null; onRetry: () => void; onSave: (patch: GoalPatch) => Promise<unknown>; onArchive: (archived: boolean) => void;
  /** Removes only the link; the project or task stays. */
  onUnlink: (kind: GoalLinkKind, targetId: string) => void; write: Write;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState<GoalColor>("blue");
  const [icon, setIcon] = useState<GoalIconName>("target");
  if (state.status === "pending") return <div className="ui"><Loading>Loading goal…</Loading></div>;
  if (state.status === "error") return <div className="ui"><LoadFailure error={state.error} onRetry={onRetry} /></div>;
  if (!state.data) return <div className="ui flex flex-col items-start gap-3"><PageHeader title="Goal not found" />
    <Hint>This goal does not exist or you do not have access to it.</Hint><Button variant="outline" size="sm" nativeButton={false} render={<Link to="/today" />}>Back to Today</Button></div>;
  const { goal, projects, tasks, milestones } = state.data;
  const marked = new Set(milestones.map(item => item.task.id));
  const edit = () => { setTitle(goal.title); setDescription(goal.description ?? ""); setColor(goal.color); setIcon(goal.icon); setEditing(true); };
  async function save(event: FormEvent) {
    event.preventDefault();
    try { await onSave({ title, description, color, icon }); setEditing(false); } catch { /* shown through write.error */ }
  }
  const unlink = (kind: GoalLinkKind, id: string, name: string) => <Button variant="ghost" size="icon-sm" className="opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 pointer-coarse:opacity-100"
    aria-label={`Unlink ${name}`} title="Unlink" disabled={write.pending} onClick={() => onUnlink(kind, id)}><X /></Button>;
  return <div className="ui max-w-page" data-goal-id={goal.id}>
    <PageHeader icon={<GoalIcon color={goal.color} icon={goal.icon} size="lg" />} title={goal.title} actions={<>
      {!goal.archived && <Button variant="outline" size="sm" data-goal-action="edit" aria-expanded={editing} onClick={() => editing ? setEditing(false) : edit()}><Pencil />Edit</Button>}
      <Button variant="ghost" size="sm" disabled={write.pending} onClick={() => onArchive(!goal.archived)}>{goal.archived ? "Restore" : "Archive"}</Button>
    </>} />
    {goal.archived && <Hint role="status">This goal is archived. It is hidden from the sidebar and keeps its data.</Hint>}
    {editing ? <form ref={releaseFocus} className="my-4 flex flex-col gap-4 rounded-xl border border-border p-4" onSubmit={save} onKeyDown={(event) => { if (event.key === "Escape") setEditing(false); }}>
      <Field><FieldLabel htmlFor="goal-title">Title</FieldLabel><Input id="goal-title" value={title} onChange={event => setTitle(event.target.value)} required maxLength={200} /></Field>
      <Field><FieldLabel htmlFor="goal-description">Description</FieldLabel><Textarea id="goal-description" value={description} onChange={event => setDescription(event.target.value)} rows={4} maxLength={10_000} placeholder="Why this goal matters and what reaching it looks like" /></Field>
      <div className="flex flex-col gap-4 sm:flex-row sm:gap-8"><ColorPicker value={color} onChange={setColor} /><IconPicker value={icon} color={color} onChange={setIcon} /></div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
        <Button type="submit" disabled={write.pending || !title.trim()}>Save goal</Button>
      </div>
    </form> : goal.description ? <p data-slot="goal-description" className="mt-1 whitespace-pre-wrap text-muted-foreground [overflow-wrap:anywhere]">{goal.description}</p>
      : !goal.archived && <Button variant="ghost" size="sm" className="-ml-2 mt-1 text-muted-foreground" onClick={edit}><Plus className="text-brand" />Add a description</Button>}
    {write.error && <FormError>{write.error}</FormError>}
    {season && <section aria-label="This season" className="mt-5"><Card className="flex-row items-start gap-3 p-4">
      <CalendarRange className="mt-0.5 size-4.5 shrink-0 text-subtle-foreground" aria-hidden="true" />
      <CardContent className="flex min-w-0 flex-1 flex-col gap-1 p-0">
        <p className="text-sm font-semibold">This season · {season.tier === "primary" ? "Primary" : "Secondary"}</p>
        <SeasonTarget text={season.target} />
      </CardContent>
      <Button variant="outline" size="sm" nativeButton={false} render={<Link to="/season" />}>Season</Button>
    </Card></section>}
    <PageSection title="Milestones" aria-label="Milestones">
      {milestones.length ? <List>{milestones.map(({ task, criteria, reached }) => <ListRow key={task.id} data-done={reached || undefined} className="justify-between">
        <Link className={cn(linkClass, reached && "text-muted-foreground line-through")} to={taskPath(task.id)}>{task.title}<MilestoneMark /></Link>
        <span className="text-xs-plus text-muted-foreground tabular-nums" aria-label={reached ? "Reached" : `${criteriaProgress(criteria)} done criteria ticked`}>{reached ? "Reached" : criteria.length ? criteriaProgress(criteria) : "No criteria"}</span>
      </ListRow>)}</List> : <Hint className="py-2">No milestones. Turn on Milestone in a linked task's details.</Hint>}
    </PageSection>
    <PageSection title="Projects" aria-label="Linked projects">
      {projects.length ? <List>{projects.map(project => <ListRow key={project.id} className="justify-between">
        <Link className={linkClass} to={`/projects/${encodeURIComponent(project.id)}`}><Hash />{project.name}</Link>{unlink("projects", project.id, project.name)}
      </ListRow>)}</List> : <Hint className="py-2">No linked projects. Link one from its project page.</Hint>}
    </PageSection>
    <PageSection title="Tasks" aria-label="Linked tasks">
      {tasks.length ? <List>{tasks.map(task => <ListRow key={task.id} data-done={task.status === "done" || undefined} className="justify-between">
        <Link className={cn(linkClass, task.status === "done" && "text-muted-foreground line-through")} to={taskPath(task.id)}>{task.title}{marked.has(task.id) && <MilestoneMark />}</Link>{unlink("tasks", task.id, task.title)}
      </ListRow>)}</List> : <Hint className="py-2">No linked tasks. Link one from its task details.</Hint>}
    </PageSection>
  </div>;
}
