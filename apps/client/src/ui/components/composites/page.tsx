import type * as React from "react";

import { cn } from "../../lib/utils";

/**
 * App layout recipes (Todoist page anatomy), so screens never hand-roll them:
 * a page header, titled sections, list rows and sidebar sections.
 */

function PageHeader({ title, icon, actions, className, ...props }: Omit<React.ComponentProps<"div">, "title"> & {
  title: React.ReactNode; icon?: React.ReactNode; actions?: React.ReactNode;
}) {
  return (
    <div data-slot="page-header" className={cn("mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2", className)} {...props}>
      <h1 className="flex min-w-0 items-center gap-2.5 text-2xl font-bold [overflow-wrap:anywhere]">{icon}{title}</h1>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

function PageSection({ title, actions, className, children, ...props }: Omit<React.ComponentProps<"section">, "title"> & {
  title: React.ReactNode; actions?: React.ReactNode;
}) {
  return (
    <section data-slot="page-section" className={cn("mt-7", className)} {...props}>
      <div className="flex items-center justify-between gap-2 border-b border-border pb-1.5">
        <h2 className="text-sm font-bold">{title}</h2>{actions}
      </div>
      {children}
    </section>
  );
}

function List({ className, ...props }: React.ComponentProps<"ul">) {
  return <ul data-slot="list" className={cn("flex flex-col", className)} {...props} />;
}

/** A Todoist list row: compact, a hairline divider, tools revealed on hover/focus (`group-hover`). */
function ListRow({ className, ...props }: React.ComponentProps<"li">) {
  return <li data-slot="list-row" className={cn("group/row flex min-h-row items-center gap-2 border-b border-border-subtle py-1.5", className)} {...props} />;
}

/** Secondary text: hints, states, counts. */
function Hint({ className, ...props }: React.ComponentProps<"p">) {
  return <p data-slot="hint" className={cn("text-xs-plus text-muted-foreground", className)} {...props} />;
}

function SidebarSectionHeader({ title, action, className, ...props }: Omit<React.ComponentProps<"div">, "title"> & { title: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div data-slot="sidebar-section-header" className={cn("flex h-control-sm items-center justify-between pr-0.5 pl-2 text-xs-plus font-semibold text-muted-foreground", className)} {...props}>
      <span>{title}</span>{action}
    </div>
  );
}

/** For a router link in the sidebar: active when it has aria-current="page" (NavLink) or data-active. */
const sidebarItemClassName = [
  "flex h-sidebar-item min-w-0 flex-1 items-center gap-2 rounded-lg px-2 text-sm text-sidebar-foreground no-underline outline-none",
  "hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring",
  "aria-[current=page]:bg-brand-tint aria-[current=page]:text-brand-tint-foreground data-active:bg-brand-tint data-active:text-brand-tint-foreground",
  "[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-subtle-foreground aria-[current=page]:[&_svg]:text-brand-tint-foreground",
].join(" ");

/**
 * The right sidebar beside a screen (the unscheduled tasks next to the schedule;
 * later rituals and the Coach chat): a titled column, sticky while the page scrolls.
 */
function RightSidebar({ title, actions, className, children, ...props }: Omit<React.ComponentProps<"aside">, "title"> & {
  title: React.ReactNode; actions?: React.ReactNode;
}) {
  return (
    <aside data-slot="right-sidebar" className={cn("sticky top-0 flex max-h-screen w-sidebar shrink-0 flex-col gap-2 self-start overflow-y-auto border-l border-border pl-4", className)} {...props}>
      <div className="flex h-control items-center justify-between gap-2">
        <h2 className="min-w-0 truncate text-sm font-bold">{title}</h2>{actions && <div className="flex items-center gap-1">{actions}</div>}
      </div>
      {children}
    </aside>
  );
}

export { Hint, List, ListRow, PageHeader, PageSection, RightSidebar, SidebarSectionHeader, sidebarItemClassName };
