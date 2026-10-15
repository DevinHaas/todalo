import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useNavigate, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AudioLines, CalendarClock, ChevronDown, HelpCircle, Layers,
  LineChart, ListFilter, MoreHorizontal, PanelLeft, Plus, Search, Star,
} from "lucide-react";
import type { Account } from "./session";
import { projectReads, reads, session } from "./runtime";
import type { TaskDto } from "./tasks";
import { Composer, TaskEditor, TaskView, TodayView, type RowActions } from "./views";
import { GoogleButton } from "./google";
import { haptics, hapticsSupported } from "./feedback";
import { useTaskWrites } from "./task-writes";
import { DisplayMenu, DisplayProvider, LayoutSwitcher, useDisplay } from "./schedule-views";
import { TodayCalendar } from "./schedule-screens";
import { TaskAttachmentsScreen } from "./attachment-screens";
import { TaskOrganizerScreen } from "./organization-screens";

// ponytail: controls without a migrated backend (search, inbox,
// filters) keep their legacy appearance but are inert
// (aria-disabled). Their tickets wire them: 12, 14, 18.
function Inert({ icon, label, badge, muted }: { icon: ReactNode; label: string; badge?: string; muted?: boolean }) {
  return <li className={muted ? "muted" : undefined}><span className="nav-item" aria-disabled="true">{icon}<span>{label}</span>{badge && <span className="nav-beta">{badge}</span>}</span></li>;
}

const startOfToday = () => { const day = new Date(); day.setHours(0, 0, 0, 0); return day.toISOString(); };

/** Legacy sidebar quick add: an undated task goes to the Inbox. */
function QuickAdd({ userId, onClose }: { userId: string; onClose: () => void }) {
  const { create } = useTaskWrites(userId);
  const [added, setAdded] = useState<TaskDto | null>(null);
  return <div className="dialog-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-label="Add task" className="dialog">
      <Composer startOpen dueDate={() => null} onCancel={onClose} onCreate={async (task) => setAdded(await create.mutateAsync(task))} />
      {added && <p role="status" className="state">Added “{added.title}” to Inbox. <Link to={`/tasks/${encodeURIComponent(added.id)}`} onClick={onClose}>View task</Link></p>}
    </div>
  </div>;
}

export function Shell({ account }: { account: Account }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const today = useQuery(reads.today(account.user.id));
  useEffect(() => {
    if (!mobileOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setMobileOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [mobileOpen]);
  const count = today.data?.openCount ?? 0;

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
        <Inert icon={<Search />} label="Search" />
        <Inert icon={<Layers />} label="Inbox" />
        <li><NavLink to="/projects" className="nav-item"><Layers /><span>Projects</span></NavLink></li>
        <li><NavLink to="/today" className="nav-item"><CalendarClock /><span>Today</span>{count > 0 && <span className="nav-badge">{count}</span>}</NavLink></li>
        <li><NavLink to="/upcoming" className="nav-item"><Layers /><span>Upcoming</span></NavLink></li>
        <Inert icon={<ListFilter />} label="Filters & Labels" />
        <Inert icon={<Star />} label="Goals" badge="BETA" muted />
        <Inert icon={<LineChart />} label="Reporting" muted />
        <Inert icon={<MoreHorizontal />} label="More" muted />
      </ul></nav>
      <span className="nav-item help" aria-disabled="true"><HelpCircle /><span>Help & resources</span></span>
    </aside>
    <div className="inset">
      <div className="toolbar">
        <div className="toolbar-start">
          <button type="button" className="icon-button trigger" aria-label="Toggle sidebar" onClick={() => { setCollapsed(false); setMobileOpen(true); }}><PanelLeft /></button>
          <LayoutSwitcher />
        </div>
        <DisplayMenu />
      </div>
      <main className="content"><Outlet /></main>
    </div>
    {adding && <QuickAdd userId={account.user.id} onClose={() => setAdding(false)} />}
  </div></DisplayProvider>;
}

export function TodayScreen({ account }: { account: Account }) {
  const query = useQuery(reads.today(account.user.id));
  // Row project pills; Today still renders if the project list fails.
  const projects = useQuery(projectReads.list(account.user.id));
  const projectNames = Object.fromEntries((projects.data ?? []).map(project => [project.id, project.name]));
  const writes = useTaskWrites(account.user.id);
  const display = useDisplay();
  return <TodayView state={query} onRetry={() => void query.refetch()} projectNames={projectNames} actions={writes.actions} writeError={writes.error}
    showCompleted={display.showCompleted} calendar={display.layout === "calendar" ? (tasks) => <TodayCalendar account={account} tasks={tasks} /> : undefined}
    composer={<Composer dueDate={startOfToday} onCreate={(task) => writes.create.mutateAsync(task)} />} />;
}

export function TaskScreen({ account }: { account: Account }) {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const query = useQuery(reads.task(account.user.id, id));
  const writes = useTaskWrites(account.user.id);
  // Legacy TaskDetailPage opens the edit dialog on arrival; closing it keeps the page.
  const [closedFor, setClosedFor] = useState<string | null>(null);
  const actions: RowActions = {
    complete: writes.actions.complete,
    remove: (task) => writes.remove.mutate(task, { onSuccess: () => navigate("/today", { replace: true }) }),
  };
  const editor = closedFor !== id && query.data && <TaskEditor key={id} task={query.data} onClose={() => setClosedFor(id)}
    onSave={async (details) => { await writes.update.mutateAsync({ id, details }); setClosedFor(id); }} />;
  return <TaskView state={query} onRetry={() => void query.refetch()} actions={actions} writeError={writes.error}
    onEdit={() => setClosedFor(null)} editor={editor}
    organize={(task) => <TaskOrganizerScreen userId={account.user.id} task={task} />}
    attachments={<TaskAttachmentsScreen userId={account.user.id} taskId={id} />} />;
}

export function AccountScreen({ account, error }: { account: Account; error: string | null }) {
  const [pending, setPending] = useState(false);
  const [feel, setFeel] = useState(haptics.enabled);
  return <section className="account-panel inline">
    <header><h1>Your account</h1><p>Signed in to todalo.</p></header>
    <dl><dt>Name</dt><dd>{account.user.name}</dd><dt>Email</dt><dd>{account.user.email}</dd></dl>
    {error && <p className="error" role="alert">{error}</p>}
    {hapticsSupported && <label className="setting">
      <input type="checkbox" checked={feel} onChange={(event) => { haptics.set(event.target.checked); setFeel(event.target.checked); }} />
      <span>Haptic feedback when completing a task</span>
    </label>}
    <GoogleButton intent="link" disabled={pending} />
    <button disabled={pending} onClick={async () => { setPending(true); await session.signOut(); setPending(false); }}>{pending ? "Please wait…" : "Sign out"}</button>
  </section>;
}
