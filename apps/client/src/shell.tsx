import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AudioLines, CalendarClock, ChevronDown, HelpCircle, Layers,
  LineChart, ListFilter, MoreHorizontal, PanelLeft, Plus, Search,
} from "lucide-react";
import type { Account } from "./session";
import { coachReads, connection, projectReads, queries, reads, session } from "./runtime";
import { taskKeys, todaySections, type NewTask, type TaskDto, type TodayDto } from "./tasks";
import { useBulkSelection } from "./bulk-screens";
import { Composer, TaskDialogs, TaskEditor, TaskTree, TaskView, TodayView, type RowActions, type TaskDialog } from "./views";
import { useEditorExtras, useTaskWrites } from "./task-writes";
import { useTaskSheet } from "./task-sheet-screen";
import { DisplayMenu, DisplayProvider, LayoutSwitcher, useDisplay } from "./schedule-views";
import { TodayCalendar } from "./schedule-screens";
import { BoardScreen } from "./board-screens";
import { TaskAttachmentsScreen } from "./attachment-screens";
import { TaskOrganizerScreen, useOrganizationMutations } from "./organization-screens";
import { Popover } from "./popover";
import { LiveUpdates, SyncStatus, useCalendarEvents } from "./calendar-screens";
import { QuickFind } from "./search-screens";
import { KeyboardCommands, taskNeighbour } from "./keyboard-screens";
import { TaskContextMenu } from "./task-menu";
import { useOpenSettings } from "./settings-nav";
import { CriteriaConfirmHost, GoalsSidebar, SeasonsSidebar, useGoalsShown, useMilestoneTaskIds, useTaskGoalOf } from "./goal-screens";
import { MilestoneTasks, TaskGoals } from "./task-tree";
import { openRitual, RitualHost, RitualsSidebar, useRitualTaskIds } from "./ritual-screens";
import { CoachChatButton, CoachChatHost } from "./coach-chat-screens";
import { CoachBar } from "./coach-bar";
import { PendingChangesContext, pendingChanges } from "./pending-changes";
import { PlanningHost } from "./planning-screens";

// ponytail: controls legacy also left without a feature (Reporting, More)
// keep their legacy appearance but are inert (aria-disabled).
function Inert({ icon, label, badge, muted }: { icon: ReactNode; label: string; badge?: string; muted?: boolean }) {
  return <li className={muted ? "muted" : undefined}><span className="nav-item" aria-disabled="true">{icon}<span>{label}</span>{badge && <span className="nav-beta">{badge}</span>}</span></li>;
}

const startOfToday = () => { const day = new Date(); day.setHours(0, 0, 0, 0); return day.toISOString(); };

/** Legacy sidebar quick add: an undated task goes to the Inbox. */
function QuickAdd({ userId, onClose }: { userId: string; onClose: () => void }) {
  const { create } = useTaskWrites(userId);
  const [added, setAdded] = useState<TaskDto | null>(null);
  return <div className="dialog-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-label="Add task" className="dialog quick-add">
      <Composer startOpen quick dueDate={() => null} onCancel={onClose} onCreate={async (task) => setAdded(await create.mutateAsync(task))} />
      {added && <p role="status" className="state">Added “{added.title}”{added.projectId ? "" : " to Inbox"}. <Link to={`/tasks/${encodeURIComponent(added.id)}`} onClick={onClose}>View task</Link></p>}
    </div>
  </div>;
}

const connectionCopy = { online: "", offline: "You're offline. Changes can't be saved until you reconnect.", unreachable: "Can't reach todalo. Changes can't be saved right now." };

/** Ticket 22: always mounted so screen readers announce each change; empty while online. */
function ConnectionStatus() {
  const state = useSyncExternalStore(connection.subscribe, connection.get);
  return <div role="status" className="connection-status" data-state={state}>{state !== "online" && <>
    {connectionCopy[state]}
    {state === "unreachable" && <button type="button" className="text-action" onClick={() => void queries.refetchQueries({ type: "active" })}>Try again</button>}
  </>}</div>;
}

/** Save and add's composer, next to the task it was saved from (legacy creationSlot). */
function InsertComposer({ edge, task, onCreate, onClose }: { edge: "above" | "below"; task: TaskDto; onCreate: (task: NewTask, direction: "above" | "below") => Promise<unknown>; onClose: () => void }) {
  return <section className="task-insert" aria-label={`Add task ${edge} ${task.title}`}>
    <Composer key={edge} startOpen projectId={task.projectId} sectionId={task.sectionId} placement={{ edge, anchorId: task.id }}
      dueDate={() => task.dueDate ? new Date(new Date(task.dueDate).setHours(0, 0, 0, 0)).toISOString() : null}
      onCancel={onClose} onCreate={onCreate} />
  </section>;
}

/** Focuses a row's title once nothing else holds focus (the dialog or composer that had it closed). */
function focusRow(id: string, fallback: HTMLElement | null) {
  requestAnimationFrame(() => {
    if (document.activeElement && document.activeElement !== document.body) return;
    (document.querySelector<HTMLElement>(`main [data-task-id="${CSS.escape(id)}"] .task-title`) ?? (fallback?.isConnected ? fallback : null))?.focus();
  });
}

/**
 * Legacy TaskKeyboardProvider's editor: a row title opens the edit dialog over
 * the list and the URL stays (`/tasks/:id` is for links). Previous/Next walk the
 * page's visible rows, Save and add opens a composer next to the row, and
 * closing returns focus to the row.
 */
function TaskDialogHost({ account, children }: { account: Account; children: ReactNode }) {
  const userId = account.user.id;
  const cache = useQueryClient();
  const [id, setId] = useState<string | null>(null);
  const [inserting, setInserting] = useState<{ edge: "above" | "below"; task: TaskDto } | null>(null);
  // ⌘E: the row whose quick add editor replaces it.
  const [editing, setEditing] = useState<string | null>(null);
  const organize = useMutation(useOrganizationMutations(userId).organize);
  const opener = useRef<HTMLElement | null>(null);
  const writes = useTaskWrites(userId);
  const extras = useEditorExtras(userId, id);
  // The row's copy shows at once (Today holds every owned task); the read keeps the editor current.
  const query = useQuery({ ...reads.task(userId, id ?? ""), enabled: id !== null,
    placeholderData: () => cache.getQueryData<TodayDto>(taskKeys.today(userId))?.tasks.find(task => task.id === id) });
  // Every owned task: rows' sub-task progress and inline children (no extra request; Shell keeps it loaded).
  const all = useQuery(reads.today(userId)).data?.tasks ?? null;
  const milestones = useMilestoneTaskIds(userId);
  const goalOfTask = useTaskGoalOf(userId);
  // Ticket 29: the Coach drafts' pending changes, shown in place in rows and the sheet.
  const coachConnected = Boolean(useQuery(coachReads.provider(userId)).data?.provider);
  const openDrafts = useQuery({ ...coachReads.drafts(userId), enabled: coachConnected }).data?.drafts;
  const pending = useMemo(() => pendingChanges(coachConnected ? openDrafts ?? [] : []), [coachConnected, openDrafts]);
  // Opening a ritual's item (Check-in, Evening review; list row, schedule block) starts that ritual instead.
  const ritualItems = useRitualTaskIds(userId);
  const { pathname } = useLocation();
  useEffect(() => { setId(null); setInserting(null); setEditing(null); }, [pathname]);
  const create = writes.create.mutateAsync;
  const dialog = useMemo<TaskDialog>(() => ({
    open(next) {
      const ritual = ritualItems.get(next);
      if (ritual) { openRitual(ritual); return; }
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setInserting(null); setEditing(null); setId(next); },
    edit(next) { setInserting(null); setEditing(next); },
    editor: (task) => editing === task.id ? <div className="dialog quick-add inline-quick-add row-edit" aria-label={`Edit ${task.title}`}>
      <Composer key={task.id} startOpen quick editing={task} dueDate={() => task.dueDate} projectId={task.projectId} sectionId={task.sectionId}
        onCancel={() => { setEditing(null); focusRow(task.id, null); }}
        onUpdate={async (details, projectId) => {
          await writes.update.mutateAsync({ id: task.id, details });
          if (projectId !== task.projectId) await organize.mutateAsync({ task, change: { projectId, sectionId: null } });
        }} />
    </div> : null,
    slot: (anchor, edge) => inserting?.task.id === anchor && inserting.edge === edge
      ? <InsertComposer edge={edge} task={inserting.task} onClose={() => { setInserting(null); focusRow(anchor, opener.current); }}
        // The composer follows the task just added, as the next draft does (legacy onCreated).
        onCreate={async (task, direction) => { const created = await create(task); setInserting({ edge: direction, task: created }); }} /> : null,
  }), [inserting, create, editing, writes.update, organize, ritualItems]);
  const close = () => { if (id) focusRow(id, opener.current); setId(null); };
  const neighbour = (step: -1 | 1) => id ? taskNeighbour(id, step) : undefined;
  const task = id ? query.data : null;
  const sheet = useTaskSheet(account, task, close);
  return <TaskDialogs.Provider value={dialog}><TaskTree.Provider value={all}><MilestoneTasks.Provider value={milestones}><TaskGoals.Provider value={goalOfTask}><PendingChangesContext.Provider value={pending}>
    <TaskContextMenu userId={userId} onOpen={dialog.open}>{children}</TaskContextMenu>
    {/* Saving keeps the sheet open (Previous/Next and sub-tasks switch the task in place). */}
    {task && <TaskEditor key={task.id} task={task} labels={extras.labels} shareUrl={extras.shareUrl} onClose={close} {...sheet}
      navigation={{ previous: Boolean(neighbour(-1)), next: Boolean(neighbour(1)), go: (step) => { const next = neighbour(step); if (next) setId(next); } }}
      onSave={(details) => writes.update.mutateAsync({ id: task.id, details })}
      onOpen={setId}
      onInsert={(edge) => { close(); setInserting({ edge, task }); }} />}
  </PendingChangesContext.Provider></TaskGoals.Provider></MilestoneTasks.Provider></TaskTree.Provider></TaskDialogs.Provider>;
}

/** The page column: lists keep a readable width; board and calendar layouts use the full width. */
function Content({ children }: { children: ReactNode }) {
  return <main className="content" data-layout={useDisplay().layout}>{children}</main>;
}

export function Shell({ account }: { account: Account }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [finding, setFinding] = useState<"find" | "sections" | null>(null);
  const [addingGoal, setAddingGoal] = useState(false);
  const goalsShown = useGoalsShown(account.user.id);
  const today = useQuery(reads.today(account.user.id));
  useEffect(() => {
    if (!mobileOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setMobileOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [mobileOpen]);
  const count = today.data?.openCount ?? 0;
  const { pathname } = useLocation();

  return <DisplayProvider><div className="app-shell" data-collapsed={collapsed} data-mobile-open={mobileOpen}>
    <div className="sidebar-backdrop" onClick={() => setMobileOpen(false)} />
    <aside className="sidebar" data-tauri-drag-region aria-label="Sidebar" onClick={(event) => { if ((event.target as Element).closest("a")) setMobileOpen(false); }}>
      <button type="button" className="icon-button sidebar-toggle" aria-label="Toggle sidebar" onClick={() => { setCollapsed(true); setMobileOpen(false); }}><PanelLeft /></button>
      <AccountMenu account={account} onNavigate={() => setMobileOpen(false)} />
      <div className="add-row">
        <button type="button" className="add-task" onClick={() => { setAdding(true); setMobileOpen(false); }}><Plus /><span>Add task</span></button>
        <Link to="/ramble" className="icon-button brand" aria-label="Open Ramble"><AudioLines /></Link>
      </div>
      <nav><GoalsSidebar userId={account.user.id} adding={addingGoal} onAdding={setAddingGoal} /><SeasonsSidebar userId={account.user.id} /><RitualsSidebar userId={account.user.id} /><ul className="nav">
        <li><button type="button" className="nav-item" onClick={() => { setFinding("find"); setMobileOpen(false); }}><Search /><span>Search</span></button></li>
        <li><NavLink to="/inbox" className="nav-item"><Layers /><span>Inbox</span></NavLink></li>
        <li><NavLink to="/projects" className="nav-item"><Layers /><span>Projects</span></NavLink></li>
        <li><NavLink to="/today" className="nav-item"><CalendarClock /><span>Today</span>{count > 0 && <span className="nav-badge">{count}</span>}</NavLink></li>
        <li><NavLink to="/upcoming" className="nav-item"><Layers /><span>Upcoming</span></NavLink></li>
        <li><NavLink to="/filters" className={({ isActive }) => isActive || pathname.startsWith("/labels") ? "nav-item active" : "nav-item"}><ListFilter /><span>Filters & Labels</span></NavLink></li>
        <Inert icon={<LineChart />} label="Reporting" muted />
        <Inert icon={<MoreHorizontal />} label="More" muted />
      </ul></nav>
      <button type="button" className="nav-item help" onClick={() => { setMobileOpen(false); window.dispatchEvent(new Event("todalo:help")); }}><HelpCircle /><span>Help & resources</span></button>
    </aside>
    <div className="inset">
      <div className="toolbar" data-tauri-drag-region>
        <div className="toolbar-start" data-tauri-drag-region>
          <button type="button" className="icon-button trigger" aria-label="Toggle sidebar" onClick={() => { setCollapsed(false); setMobileOpen(true); }}><PanelLeft /></button>
          <LayoutSwitcher />
        </div>
        <div className="toolbar-start" data-tauri-drag-region><SyncStatus userId={account.user.id} /><CoachChatButton userId={account.user.id} /><DisplayMenu /></div>
      </div>
      <ConnectionStatus />
      {/* Ticket 29: the Coach bar floats at the bottom of every main view. */}
      <Content><TaskDialogHost account={account}><Outlet /><CoachBar userId={account.user.id} /></TaskDialogHost></Content>
    </div>
    <RitualHost userId={account.user.id} />
    <CoachChatHost userId={account.user.id} />
    <PlanningHost userId={account.user.id} />
    {adding && <QuickAdd userId={account.user.id} onClose={() => setAdding(false)} />}
    <LiveUpdates userId={account.user.id} />
    <CriteriaConfirmHost />
    {finding && <QuickFind userId={account.user.id} sectionsOnly={finding === "sections"} onClose={() => setFinding(null)} />}
    <KeyboardCommands userId={account.user.id} onCapture={() => setAdding(true)}
      // Hidden Goals: the key passes on.
      onNewGoal={() => { if (!goalsShown) return false; setCollapsed(false); setMobileOpen(true); setAddingGoal(true); }} onFind={(sectionsOnly) => setFinding(sectionsOnly ? "sections" : "find")}
      onSidebar={() => window.matchMedia("(max-width: 767px)").matches ? setMobileOpen(open => !open) : setCollapsed(closed => !closed)} />
  </div></DisplayProvider>;
}

export function TodayScreen({ account }: { account: Account }) {
  const query = useQuery(reads.today(account.user.id));
  // Row project pills; Today still renders if the project list fails.
  const projects = useQuery(projectReads.list(account.user.id));
  const projectNames = Object.fromEntries((projects.data ?? []).map(project => [project.id, project.name]));
  const writes = useTaskWrites(account.user.id);
  const display = useDisplay();
  const events = useCalendarEvents(account.user.id);
  const { overdue, today } = todaySections(query.data?.tasks ?? [], new Date(), display.showCompleted);
  const selection = useBulkSelection(account.user.id, [...overdue, ...today]);
  return <TodayView state={query} events={events} onRetry={() => void query.refetch()} projectNames={projectNames} actions={writes.actions} selection={selection}
    // `calendar` renders any non-list layout over the whole collection (legacy Today's ViewSwitcher).
    showCompleted={display.showCompleted} calendar={display.layout === "calendar" ? (tasks) => <TodayCalendar account={account} tasks={tasks} />
      : display.layout === "board" ? (tasks) => <BoardScreen account={account} tasks={tasks} /> : undefined}
    composer={<Composer dueDate={startOfToday} onCreate={(task) => writes.create.mutateAsync(task)} />} />;
}

export function TaskScreen({ account }: { account: Account }) {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const query = useQuery(reads.task(account.user.id, id));
  const writes = useTaskWrites(account.user.id);
  // Legacy TaskDetailPage opens the edit dialog on arrival; closing it keeps the page.
  const [closedFor, setClosedFor] = useState<string | null>(null);
  // Save and add above/below: the editor closes and a composer adds next to this task.
  const [inserting, setInserting] = useState<{ edge: "above" | "below"; task: TaskDto } | null>(null);
  const actions: RowActions = {
    complete: writes.actions.complete,
    remove: (task) => writes.remove.mutate(task, { onSuccess: () => navigate("/today", { replace: true }) }),
  };
  // The editor's label checkboxes (without the list it keeps the task's labels) and task link.
  const extras = useEditorExtras(account.user.id, id);
  const sheet = useTaskSheet(account, query.data, () => navigate("/today", { replace: true }));
  const editor = inserting?.task.id === id ? <InsertComposer edge={inserting.edge} task={inserting.task} onCreate={(task) => writes.create.mutateAsync(task)} onClose={() => setInserting(null)} />
    : closedFor !== id && query.data && <TaskEditor key={id} task={query.data} labels={extras.labels} shareUrl={extras.shareUrl} onClose={() => setClosedFor(id)} {...sheet}
    onSave={(details) => writes.update.mutateAsync({ id, details })}
    onOpen={(other) => navigate(`/tasks/${encodeURIComponent(other)}`)}
    onInsert={(edge) => { setClosedFor(id); setInserting({ edge, task: query.data! }); }} />;
  return <TaskView state={query} onRetry={() => void query.refetch()} actions={actions}
    onEdit={() => setClosedFor(null)} editor={editor}
    organize={(task) => <TaskOrganizerScreen userId={account.user.id} task={task} />}
    attachments={<TaskAttachmentsScreen userId={account.user.id} taskId={id} />} />;
}

/** Legacy sidebar account menu: Settings and Log out. */
function AccountMenu({ account, onNavigate }: { account: Account; onNavigate: () => void }) {
  const openSettings = useOpenSettings();
  const [pending, setPending] = useState(false);
  return <Popover label="Account menu" role="menu" className="account-menu" triggerClassName="account-trigger"
    trigger={<><span className="avatar">{account.user.name.slice(0, 1).toUpperCase()}</span><span>{account.user.name}</span><ChevronDown className="chevron" /></>}>
    {close => <>
      <button type="button" role="menuitem" className="popover-item" onClick={() => { close(false); onNavigate(); openSettings(); }}>Settings</button>
      <button type="button" role="menuitem" className="popover-item" disabled={pending} onClick={async () => { setPending(true); await session.signOut(); setPending(false); }}>{pending ? "Please wait…" : "Log out"}</button>
    </>}
  </Popover>;
}
