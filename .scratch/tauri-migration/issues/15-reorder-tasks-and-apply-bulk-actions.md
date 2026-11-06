# 15. Reorder tasks and apply bulk actions

Status: in-progress (code-complete; browser-verified against the isolated QA API incl. touch emulation; native Mac/iOS runs and physical devices pending)
Type: task

**Blocked by:** 13, 14.
    **What it delivers:** Users select tasks, reorder them and apply existing bulk completion/deletion/date/metadata/move actions.
    **Acceptance:** Preserve sort/status semantics and transactional validation; prevent duplicate effects on retry; verify keyboard, touch and drag/drop behavior and visible failed/partial-result handling; keep all affected queries synchronized.

## Comments

Published from the approved implementation proposal on 2026-10-04. Eligibility requires every listed blocker to be complete.

2026-10-16 — implemented. Bulk complete/delete/clear-date/metadata/move and manual
reorder share `@todalo/server/bulk` (+ the now-atomic `organization.moveTasks`) with the
legacy actions; each checks the whole selection's ownership before writing, and
multi-row writes commit in one neon-http batch. Reorder is relative to the server's
current order and renumbers the collection, so retries and concurrent reorders stay
consistent. Client: Select mode + legacy toolbar on Today and project pages, grip-handle
drag (pointer/touch) and keyboard reorder via @dnd-kit. Evidence:
`docs/qa/tauri-bulk.md` (+ `docs/qa/tauri-bulk/`); conventions: `apps/client/README.md`
("Reorder and bulk actions"). Native commands are covered by Rust unit tests only.
