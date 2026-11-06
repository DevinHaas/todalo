# 14. Use labels and saved filters

Status: in-progress (code-complete; browser-verified against the isolated QA API; native Mac/iOS runs and physical devices pending)
Type: task

**Blocked by:** 11.
    **What it delivers:** Users create/edit/delete labels, assign task labels and open/save/delete their existing saved filters.
    **Acceptance:** Preserve filter definitions and label relationships; expose the existing metadata editor behavior; update affected task lists/counts; test cross-user IDs and deleted-label/filter states. Bulk assignment is ticket 15.

## Comments

Published from the approved implementation proposal on 2026-10-04. Eligibility requires every listed blocker to be complete.

2026-10-15 — implemented. Labels and saved filters share `@todalo/server/metadata`
with the legacy actions; legacy-format filter definitions open unchanged (parsed,
never rewritten). Evidence: `docs/qa/tauri-labels-filters.md` (+
`docs/qa/tauri-labels-filters/`); conventions: `apps/client/README.md` ("Labels
and saved filters"). Native commands are covered by Rust unit tests only.
