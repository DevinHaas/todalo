# 17. Switch project layouts and use board interactions

Status: in-progress (code-complete; browser-verified against the isolated QA API with mouse, keyboard and touch emulation at desktop and 390×844; native Mac/iOS runs and physical devices pending)
Type: task

**Blocked by:** 15.
    **What it delivers:** Project list/board layouts, view switching and task status movement work across platforms.
    **Acceptance:** Preserve current display preferences, ordering and task membership; verify touch and mouse interactions plus accessible alternatives; regression-test drag cancellation and failed mutations. Use the operations already delivered by earlier slices.

## Comments

Published from the approved implementation proposal on 2026-10-04. Eligibility requires every listed blocker to be complete.

2026-10-16 — Implemented. Display's Board option and the toolbar arrows are active
(list → board → calendar, in memory like legacy). Today, Upcoming and project pages render
the legacy status board (To do / In progress / Done); projects also get Calendar. Drops
use the existing reorder command, extended with an owner-checked `status`
(`POST /api/v1/tasks/:id/reorder`, native `reorder_task`): another column sets the status
and appends in one batch; within a column the card is placed next to another of the same
collection. Optimistic with rollback; failures show the API message. Renumbering no
longer bumps `updatedAt` (a ticket 15 bug exposed once the test boundary modelled
drizzle's `$onUpdate`). Evidence: `docs/qa/tauri-board.md` (+ `docs/qa/tauri-board/`);
conventions: `apps/client/README.md` ("Layouts and the status board"). Legacy had no
section columns, add-in-column or column collapse on its board, so none were added; label,
filter and search pages still render only their list. Native commands covered by Rust
unit tests only.
