# 04. Import from Todoist in Settings (shared client)

Status: in-progress (browser verified; Mac app and iOS Simulator pending)
Type: task

**Blocked by:** 03.

**What it delivers:** An "Import" section in `/account` (`#import`): Connect Todoist, project + category selection (all on except completed), Import with progress, summary with warnings, and re-run messaging ("N already imported"). Native shells open the authorize URL through the opener plugin scoped to `https://app.todoist.com/oauth/authorize*`; the `app.todalo.client://import/todoist` deep link and window focus refetch status.

**Acceptance:** Works in browser, Mac app and iOS Simulator; keyboard and screen-reader accessible; cancel/denial/expiry states are clear and recoverable; user task/project/label queries are invalidated after a run.

## Comments

2026-11-06 — Code complete: `apps/client/src/imports.ts`, `import-screen.tsx` (ImportSettingsScreen in Account), Rust `src-tauri/src/imports.rs` (opens only `https://app.todoist.com/oauth/authorize`). No deep-link handler needed: the return link just brings the app forward and the status query refetches on focus (and polls every 3 s while pending). Not yet run in browser/Mac/simulator.

2026-11-06 — Browser verified end to end, see `docs/qa/todoist-import.md`. Fixed checkbox sizing.
