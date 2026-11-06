# 03. List rows: two-line layout with sub-task and comment indicators

Status: resolved
Type: task

**Blocked by:** 01, 02.

**What it delivers:** `TaskRow` (views.tsx) per `reference-list-indicators.png`: circle + title, a second line with green date/time (calendar icon; red when overdue), deadline, priority, labels, sub-task indicator (branch icon, direct-children `done/total`, chevron) and comment indicator (bubble + count), project name + icon right-aligned; dividers; focused row highlighted with a blue outline. Indicators only when non-zero. Rows indent by depth; the chevron collapses in-list children (shared `collapsedTasks`, hides every descendant) or expands filtered-out children inline, recursively. Children come from a `TaskTree` context fed by the always-loaded Today read (no extra request).

**Acceptance:** View tests: no indicator at 0, `1/3` and comment count rendered, chevron aria-expanded, nested child rendered indented when expanded. Checked in the browser on Today, Inbox and a project.

## Comments

2026-11-06: Done. `TaskRow` two-line layout, `listTree`, `TaskTree` context (Today read) for direct-children counts and inline expansion; Inbox/label buckets keep sub-tasks under a listed parent. Checked on Today in light and dark.
