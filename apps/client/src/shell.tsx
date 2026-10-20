import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AudioLines, CalendarClock, ChevronDown, HelpCircle, Layers,
  LineChart, ListFilter, MoreHorizontal, PanelLeft, Plus, Search, Star,
} from "lucide-react";
import type { Account } from "./session";
import { connection, projectReads, queries, reads, session } from "./runtime";
import { taskKeys, todaySections, type NewTask, type TaskDto, type TodayDto } from "./tasks";
import { useBulkSelection } from "./bulk-screens";
import { Composer, TaskDialogs, TaskEditor, TaskView, TodayView, type RowActions, type TaskDialog } from "./views";
import { haptics, hapticsSupported } from "./feedback";
import { theme } from "./theme";
import { useEditorExtras, useTaskWrites } from "./task-writes";
import { DisplayMenu, DisplayProvider, LayoutSwitcher, useDisplay } from "./schedule-views";
import { TodayCalendar } from "./schedule-screens";
import { BoardScreen } from "./board-screens";
import { TaskAttachmentsScreen } from "./attachment-screens";
import { TaskOrganizerScreen } from "./organization-screens";
import { SmartDatesSettingScreen } from "./settings-screen";
import { CalendarSettingsScreen, LiveUpdates, useCalendarEvents } from "./calendar-screens";
import { QuickFind } from "./search-screens";
import { KeyboardCommands, ShortcutSettingsScreen, taskNeighbour } from "./keyboard-screens";

// ponytail: controls legacy also left without a feature (Goals, Reporting, More)
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
function TaskDialogHost({ userId, children }: { userId: string; children: ReactNode }) {
  const cache = useQueryClient();
  const [id, setId] = useState<string | null>(null);
  const [inserting, setInserting] = useState<{ edge: "above" | "below"; task: TaskDto } | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const writes = useTaskWrites(userId);
  const extras = useEditorExtras(userId, id);
  // The row's copy shows at once (Today holds every owned task); the read keeps the editor current.
  const query = useQuery({ ...reads.task(userId, id ?? ""), enabled: id !== null,
    placeholderData: () => cache.getQueryData<TodayDto>(taskKeys.today(userId))?.tasks.find(task => task.id === id) });
  const { pathname } = useLocation();
  useEffect(() => { setId(null); setInserting(null); }, [pathname]);
  const create = writes.create.mutateAsync;
  const dialog = useMemo<TaskDialog>(() => ({
    open(next) { opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setInserting(null); setId(next); },
    slot: (anchor, edge) => inserting?.task.id === anchor && inserting.edge === edge
      ? <InsertComposer edge={edge} task={inserting.task} onClose={() => { setInserting(null); focusRow(anchor, opener.current); }}
        // The composer follows the task just added, as the next draft does (legacy onCreated).
        onCreate={async (task, direction) => { const created = await create(task); setInserting({ edge: direction, task: created }); }} /> : null,
  }), [inserting, create]);
  const close = () => { if (id) focusRow(id, opener.current); setId(null); };
  const neighbour = (step: -1 | 1) => id ? taskNeighbour(id, step) : undefined;
  const task = id ? query.data : null;
  return <TaskDialogs.Provider value={dialog}>
    {children}
    {task && <TaskEditor key={task.id} task={task} labels={extras.labels} shareUrl={extras.shareUrl} onClose={close}
      navigation={{ previous: Boolean(neighbour(-1)), next: Boolean(neighbour(1)), go: (step) => { const next = neighbour(step); if (next) setId(next); } }}
      onSave={async (details) => { await writes.update.mutateAsync({ id: task.id, details }); close(); }}
      onInsert={(edge) => setInserting({ edge, task })} />}
  </TaskDialogs.Provider>;
}

export function Shell({ account }: { account: Account }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [finding, setFinding] = useState<"find" | "sections" | null>(null);
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
    <aside className="sidebar" aria-label="Sidebar" onClick={(event) => { if ((event.target as Element).closest("a")) setMobileOpen(false); }}>
      <button type="button" className="icon-button sidebar-toggle" aria-label="Toggle sidebar" onClick={() => { setCollapsed(true); setMobileOpen(false); }}><PanelLeft /></button>
      <Link to="/account" className="account-trigger" aria-label="Account">
        <span className="avatar">{account.user.name.slice(0, 1).toUpperCase()}</span>
        <span>{account.user.name}</span><ChevronDown className="chevron" />
      </Link>
      <div className="add-row">
        <button type="button" className="add-task" onClick={() => { setAdding(true); setMobileOpen(false); }}><Plus /><span>Add task</span></button>
        <Link to="/ramble" className="icon-button brand" aria-label="Open Ramble"><AudioLines /></Link>
      </div>
      <nav><ul className="nav">
        <li><button type="button" className="nav-item" onClick={() => { setFinding("find"); setMobileOpen(false); }}><Search /><span>Search</span></button></li>
        <li><NavLink to="/inbox" className="nav-item"><Layers /><span>Inbox</span></NavLink></li>
        <li><NavLink to="/projects" className="nav-item"><Layers /><span>Projects</span></NavLink></li>
        <li><NavLink to="/today" className="nav-item"><CalendarClock /><span>Today</span>{count > 0 && <span className="nav-badge">{count}</span>}</NavLink></li>
        <li><NavLink to="/upcoming" className="nav-item"><Layers /><span>Upcoming</span></NavLink></li>
        <li><NavLink to="/filters" className={({ isActive }) => isActive || pathname.startsWith("/labels") ? "nav-item active" : "nav-item"}><ListFilter /><span>Filters & Labels</span></NavLink></li>
        <Inert icon={<Star />} label="Goals" badge="BETA" muted />
        <Inert icon={<LineChart />} label="Reporting" muted />
        <Inert icon={<MoreHorizontal />} label="More" muted />
      </ul></nav>
      <button type="button" className="nav-item help" onClick={() => { setMobileOpen(false); window.dispatchEvent(new Event("todalo:help")); }}><HelpCircle /><span>Help & resources</span></button>
    </aside>
    <div className="inset">
      <div className="toolbar">
        <div className="toolbar-start">
          <button type="button" className="icon-button trigger" aria-label="Toggle sidebar" onClick={() => { setCollapsed(false); setMobileOpen(true); }}><PanelLeft /></button>
          <LayoutSwitcher />
        </div>
        <DisplayMenu />
      </div>
      <ConnectionStatus />
      <main className="content"><TaskDialogHost userId={account.user.id}><Outlet /></TaskDialogHost></main>
    </div>
    {adding && <QuickAdd userId={account.user.id} onClose={() => setAdding(false)} />}
    <LiveUpdates userId={account.user.id} />
    {finding && <QuickFind userId={account.user.id} sectionsOnly={finding === "sections"} onClose={() => setFinding(null)} />}
    <KeyboardCommands userId={account.user.id} onCapture={() => setAdding(true)} onFind={(sectionsOnly) => setFinding(sectionsOnly ? "sections" : "find")}
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
  return <TodayView state={query} events={events} onRetry={() => void query.refetch()} projectNames={projectNames} actions={writes.actions} writeError={writes.error} selection={selection}
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
  const editor = inserting?.task.id === id ? <InsertComposer edge={inserting.edge} task={inserting.task} onCreate={(task) => writes.create.mutateAsync(task)} onClose={() => setInserting(null)} />
    : closedFor !== id && query.data && <TaskEditor key={id} task={query.data} labels={extras.labels} shareUrl={extras.shareUrl} onClose={() => setClosedFor(id)}
    onSave={async (details) => { await writes.update.mutateAsync({ id, details }); setClosedFor(id); }}
    onInsert={(edge) => setInserting({ edge, task: query.data! })} />;
  return <TaskView state={query} onRetry={() => void query.refetch()} actions={actions} writeError={writes.error}
    onEdit={() => setClosedFor(null)} editor={editor}
    organize={(task) => <TaskOrganizerScreen userId={account.user.id} task={task} />}
    attachments={<TaskAttachmentsScreen userId={account.user.id} taskId={id} />} />;
}

export function AccountScreen({ account, error }: { account: Account; error: string | null }) {
  const [pending, setPending] = useState(false);
  const [feel, setFeel] = useState(haptics.enabled);
  const dark = useSyncExternalStore(theme.subscribe, theme.dark);
  return <section className="account-panel inline">
    <header><h1>Your account</h1><p>Signed in to todalo.</p></header>
    <dl><dt>Name</dt><dd>{account.user.name}</dd><dt>Email</dt><dd>{account.user.email}</dd></dl>
    {error && <p className="error" role="alert">{error}</p>}
    <SmartDatesSettingScreen userId={account.user.id} />
    {hapticsSupported && <label className="setting">
      <input type="checkbox" checked={feel} onChange={(event) => { haptics.set(event.target.checked); setFeel(event.target.checked); }} />
      <span>Haptic feedback when completing a task</span>
    </label>}
    <label className="setting">
      <input type="checkbox" checked={dark} onChange={(event) => theme.set(event.target.checked)} />
      <span>Dark theme</span>
    </label>
    <CalendarSettingsScreen userId={account.user.id} />
    <ShortcutSettingsScreen userId={account.user.id} />
    <button disabled={pending} onClick={async () => { setPending(true); await session.signOut(); setPending(false); }}>{pending ? "Please wait…" : "Sign out"}</button>
  </section>;
}
