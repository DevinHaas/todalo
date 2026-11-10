# Filters & Labels (Todoist model) — evidence

Shared client (Vite 5191) against the isolated QA API
(`QA_API_PORT=3041 QA_CLIENT_ORIGIN=http://localhost:5191 bun --no-env-file scripts/auth-smoke-server.ts`),
Playwright at 1280×860, signed in as `existing@example.test`. The fixtures add a
favorite query filter `Urgent, then today` beside the ticket-14 legacy rows.

- `/filters`: My Filters and Labels, collapsible, `+` on each header, tinted
  icons, hover tools (edit, favorite, delete). `page-light.png`, `page-dark.png`,
  `row-hover-tools.png`.
- Add label: name counter, Charcoal default, favorite switch; the new label
  appeared under the sidebar's Favorites. `add-label-dialog.png`.
- Add filter: Filter Assist card, counters, live preview with one list per
  comma part; `today &` shows "The query ends early…" and disables Add.
  `add-filter-dialog.png`.
- Filter Assist without a Coach provider answers "Connect the Coach in
  Settings › Coach to use Filter Assist." `filter-assist.png`.
- The saved query filter opens with its description and both lists
  (`query-filter-page.png`); legacy `Design work` still opens with its task;
  another user's filter is "Filter not found".
- Editing legacy `Overdue anything` pre-fills `overdue` and warns that saving
  as a query lists open tasks only. `edit-legacy-filter.png`.

Not verified: native Mac/iOS (`assist_filter` and the widened bodies are
covered by Rust unit tests only), a real Coach provider for Filter Assist (route
covered with a fake model), production Postgres migration run.
