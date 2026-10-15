import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AudioLines, CalendarClock, ChevronDown, ChevronLeft, ChevronRight, HelpCircle, Layers,
  LineChart, List, ListFilter, MoreHorizontal, PanelLeft, Plus, Search, Star,
} from "lucide-react";
import type { Account } from "./session";
import { reads, session } from "./runtime";
import { TaskView, TodayView } from "./views";

// ponytail: controls without a migrated backend (search, add task, inbox,
// projects, upcoming, filters, display) keep their legacy appearance but are inert
// (aria-disabled). Their tickets wire them: 5, 8, 12, 14, 16, 18.
function Inert({ icon, label, badge, muted }: { icon: ReactNode; label: string; badge?: string; muted?: boolean }) {
  return <li className={muted ? "muted" : undefined}><span className="nav-item" aria-disabled="true">{icon}<span>{label}</span>{badge && <span className="nav-beta">{badge}</span>}</span></li>;
}

export function Shell({ account }: { account: Account }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const today = useQuery(reads.today(account.user.id));
  useEffect(() => {
    if (!mobileOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setMobileOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [mobileOpen]);
  const count = today.data?.openCount ?? 0;

  return <div className="app-shell" data-collapsed={collapsed} data-mobile-open={mobileOpen}>
    <div className="sidebar-backdrop" onClick={() => setMobileOpen(false)} />
    <aside className="sidebar" aria-label="Sidebar" onClick={(event) => { if ((event.target as Element).closest("a")) setMobileOpen(false); }}>
      <button type="button" className="icon-button sidebar-toggle" aria-label="Toggle sidebar" onClick={() => { setCollapsed(true); setMobileOpen(false); }}><PanelLeft /></button>
      <Link to="/account" className="account-trigger" aria-label="Account">
        <span className="avatar">{account.user.name.slice(0, 1).toUpperCase()}</span>
        <span>{account.user.name}</span><ChevronDown className="chevron" />
      </Link>
      <div className="add-row">
        <span className="add-task" aria-disabled="true"><Plus /><span>Add task</span></span>
        <span className="icon-button brand" aria-disabled="true" aria-label="Open Ramble"><AudioLines /></span>
      </div>
      <nav><ul className="nav">
        <Inert icon={<Search />} label="Search" />
        <Inert icon={<Layers />} label="Inbox" />
        <Inert icon={<Layers />} label="Projects" />
        <li><NavLink to="/today" className="nav-item"><CalendarClock /><span>Today</span>{count > 0 && <span className="nav-badge">{count}</span>}</NavLink></li>
        <Inert icon={<Layers />} label="Upcoming" />
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
          <span className="icon-button" aria-disabled="true"><ChevronLeft /></span>
          <span className="icon-button" aria-disabled="true"><ChevronRight /></span>
          <span className="layout-label">List</span>
        </div>
        <span className="display-button" aria-disabled="true"><List /><span>Display</span></span>
      </div>
      <main className="content"><Outlet /></main>
    </div>
  </div>;
}

export function TodayScreen({ account }: { account: Account }) {
  const query = useQuery(reads.today(account.user.id));
  return <TodayView state={query} onRetry={() => void query.refetch()} />;
}

export function TaskScreen({ account }: { account: Account }) {
  const { id = "" } = useParams();
  const query = useQuery(reads.task(account.user.id, id));
  return <TaskView state={query} onRetry={() => void query.refetch()} />;
}

export function AccountScreen({ account, error }: { account: Account; error: string | null }) {
  const [pending, setPending] = useState(false);
  return <section className="account-panel inline">
    <header><h1>Your account</h1><p>Signed in to todalo.</p></header>
    <dl><dt>Name</dt><dd>{account.user.name}</dd><dt>Email</dt><dd>{account.user.email}</dd></dl>
    {error && <p className="error" role="alert">{error}</p>}
    <button disabled={pending} onClick={async () => { setPending(true); await session.signOut(); setPending(false); }}>{pending ? "Please wait…" : "Sign out"}</button>
  </section>;
}
