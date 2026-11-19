import type { CSSProperties, ReactNode } from "react";

/**
 * Loading skeletons: placeholders in the shape of what is loading, with a slow
 * shimmer (styles.css "Loading skeletons"). They fade in after a beat, so a quick
 * load never flashes. Screen readers hear `label` once; the shapes are hidden.
 * Legacy markup (task-row, setting-card), so they work inside and outside `.ui`.
 */
export function Skeleton({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return <div role="status" aria-busy="true" className={className ? `skeleton-group ${className}` : "skeleton-group"} data-skeleton="">
    <span className="sr-only">{label}</span>
    <div aria-hidden="true">{children}</div>
  </div>;
}

/** One shimmering bar. */
export const Bar = ({ w, h = ".75rem", round = false, style }: { w: string; h?: string; round?: boolean; style?: CSSProperties }) =>
  <span className={round ? "skeleton skeleton-round" : "skeleton"} style={{ width: w, height: h, ...style }} />;

// Fixed, uneven widths read as real text; random ones would jump on every render.
const titles = ["62%", "44%", "71%", "36%", "55%", "67%", "48%", "59%"];
const metas = ["4.5rem", "3.25rem", "5.5rem", "3.75rem", "4.75rem"];

/** A task row: completion circle, title, meta pills; the real row's box (border, height). */
const TaskRowSkeleton = ({ i }: { i: number }) => <div className="task-row skeleton-row">
  <span className="skeleton skeleton-circle" />
  <div className="row-body">
    <Bar w={titles[i % titles.length]} h=".875rem" style={{ marginBlock: ".3125rem" }} />
    <div className="row-meta">{i % 3 !== 2 && <Bar w={metas[i % metas.length]} h=".625rem" />}<Bar w={metas[(i + 2) % metas.length]} h=".625rem" /></div>
  </div>
</div>;

export const TaskRowsSkeleton = ({ rows = 5 }: { rows?: number }) => <>{Array.from({ length: rows }, (_, i) => <TaskRowSkeleton key={i} i={i} />)}</>;

/** A task list: an optional section heading, then rows. */
export const TaskListSkeleton = ({ rows = 5, heading = true, label = "Loading tasks" }: { rows?: number; heading?: boolean; label?: string }) =>
  <Skeleton label={label} className="skeleton-list">{heading && <Bar w="7.5rem" h=".75rem" style={{ marginBottom: ".75rem" }} />}<TaskRowsSkeleton rows={rows} /></Skeleton>;

/** A page title (and its count line), for pages whose header waits on the data too. */
export const PageHeaderSkeleton = ({ count = true }: { count?: boolean }) => <div className="skeleton-header">
  <Bar w="11rem" h="1.5rem" />{count && <Bar w="4.5rem" h=".75rem" />}
</div>;

/** Compact lines: projects, labels, comments, attachments, pickers. */
export const LinesSkeleton = ({ rows = 3, label, icon = true }: { rows?: number; label: string; icon?: boolean }) =>
  <Skeleton label={label} className="skeleton-lines">{Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton-line">
    {icon && <Bar w="1rem" h="1rem" />}<Bar w={titles[(i + 3) % titles.length]} h=".75rem" />
  </div>)}</Skeleton>;

/** Settings-style cards: title, hint, a control on the right. */
export const CardsSkeleton = ({ rows = 3, label }: { rows?: number; label: string }) =>
  <Skeleton label={label} className="skeleton-cards">{Array.from({ length: rows }, (_, i) => <div key={i} className="setting-card skeleton-card">
    <div className="skeleton-stack"><Bar w={["9rem", "12rem", "7.5rem"][i % 3]} h=".8125rem" /><Bar w={["70%", "55%", "62%"][i % 3]} h=".625rem" /></div>
    <Bar w="2.25rem" h="1.25rem" round />
  </div>)}</Skeleton>;

// The week calendar's blocks: [day, top in hours from the first row, length in hours].
const blocks: [number, number, number][] = [[0, 0, .75], [0, 2, 2], [1, 0, .75], [1, 2, 1.5], [1, 7, 1], [2, 0, .75], [2, 6, 2], [3, 1.5, 1.5], [3, 3.5, 1.5], [4, 0, .75], [4, 2, 2], [5, 3, 2], [6, 2, 1.5]];

/** The week (or day) calendar: day headings, hour rules and a few blocks. */
export function CalendarSkeleton({ days = 7, label = "Loading your calendar" }: { days?: number; label?: string }) {
  return <Skeleton label={label} className="skeleton-calendar">
    <div className="skeleton-days" style={{ "--days": days } as CSSProperties}>
      {Array.from({ length: days }, (_, d) => <div key={d} className="skeleton-day">
        <Bar w="3rem" h=".75rem" style={{ marginInline: "auto" }} />
        <div className="skeleton-day-body">{blocks.filter(([day]) => day === d % 7).map(([, top, length], i) =>
          <Bar key={i} w="auto" h={`${length * 3}rem`} style={{ position: "absolute", insetInline: ".25rem", top: `${top * 3}rem` }} />)}</div>
      </div>)}
    </div>
  </Skeleton>;
}

/** The month calendar: a grid of days, a few with blocks. */
export const MonthSkeleton = ({ label = "Loading your calendar" }: { label?: string }) => <Skeleton label={label} className="skeleton-calendar">
  <div className="skeleton-days skeleton-month" style={{ "--days": 7 } as CSSProperties}>
    {Array.from({ length: 35 }, (_, i) => <div key={i} className="skeleton-cell"><Bar w="1.25rem" h=".625rem" />
      {(i * 7) % 5 < 2 && <Bar w={metas[i % metas.length]} h=".875rem" style={{ maxWidth: "100%" }} />}</div>)}
  </div>
</Skeleton>;

/** The task page: title, description, then its properties. */
export const TaskDetailSkeleton = () => <Skeleton label="Loading task" className="skeleton-detail">
  <Bar w="55%" h="1.5rem" />
  <div className="skeleton-stack"><Bar w="90%" h=".75rem" /><Bar w="72%" h=".75rem" /></div>
  <div className="skeleton-stack">{["6rem", "8rem", "5rem"].map(w => <div key={w} className="skeleton-line"><Bar w="1rem" h="1rem" /><Bar w={w} h=".75rem" /></div>)}</div>
</Skeleton>;

/** A goal's page: icon and title, the season card, then its milestones and tasks. */
export const GoalPageSkeleton = () => <Skeleton label="Loading goal" className="skeleton-page">
  <div className="skeleton-line skeleton-title-line"><Bar w="2.5rem" h="2.5rem" /><Bar w="14rem" h="1.75rem" /></div>
  <div className="skeleton-box" style={{ height: "5.5rem" }} />
  <Bar w="6rem" h=".875rem" style={{ marginTop: "1rem" }} /><TaskRowsSkeleton rows={2} />
  <Bar w="4.5rem" h=".875rem" style={{ marginTop: "1rem" }} /><TaskRowsSkeleton rows={3} />
</Skeleton>;

/** The season page: title and progress, the trajectory chart, the goal rows. */
export const SeasonSkeleton = () => <Skeleton label="Loading season" className="skeleton-page">
  <div className="skeleton-header"><Bar w="9rem" h="1.75rem" /><Bar w="16rem" h=".875rem" /></div>
  <Bar w="100%" h=".25rem" />
  <Bar w="6rem" h=".875rem" style={{ marginTop: "1rem" }} />
  <div className="skeleton-box" style={{ height: "14rem" }} />
  <Bar w="5rem" h=".875rem" style={{ marginTop: "1rem" }} />
  {[0, 1, 2].map(i => <div key={i} className="skeleton-line skeleton-goal-row"><Bar w="2.25rem" h="1.25rem" round /><Bar w="1.25rem" h="1.25rem" /><Bar w={titles[i + 1]} h=".875rem" style={{ maxWidth: "16rem" }} /></div>)}
</Skeleton>;

/** A sidebar section (Goals, My Projects) while it loads: its heading and a few items, so the nav doesn't jump. */
export const SidebarSkeleton = ({ rows = 3, label }: { rows?: number; label: string }) =>
  <Skeleton label={label} className="skeleton-sidebar"><Bar w="4rem" h=".625rem" style={{ margin: ".5rem .5rem .75rem" }} />
    {Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton-line skeleton-nav-item"><Bar w="1rem" h="1rem" /><Bar w={["7rem", "9.5rem", "6rem", "8rem"][i % 4]} h=".625rem" /></div>)}
  </Skeleton>;
