# Ticket 18 — find tasks and reopen task links (QA evidence)

Date: 2026-10-16. Conventions: `apps/client/README.md` "Search and task links".

## Automated

- `packages/server/src/search.test.ts` — legacy semantics: title+description
  substring, case-insensitive, sortOrder, empty = all, `q` cut to 200; Quick Find
  item order/hrefs (encoded task IDs, section anchors), title-only, 40 cap,
  sections-only mode.
- `apps/api/src/search-routes.test.ts` — 401 without a session; only the session
  user's tasks/projects/sections (another user's matching rows never appear);
  DTO allow-list; `no-store`; missing, repeated and overlong `q`.
- `apps/client/src/search.test.ts` — browser transport encodes the query only as
  `q`, maps 401/500; task writes invalidate search keys; Quick Find and /search
  views; editor "Task link · Copy link" row; legacy clipboard messages;
  `openRoute` accepts only `/tasks/<id>` and skips duplicates; the native link
  loop opens every route until the command fails.
- `src-tauri/src/links.rs` — accepts `app.todalo.client://tasks/<id>` and
  `https://<API origin>/tasks/<id>` only; rejects OAuth callbacks, other routes,
  sub-paths (`/complete`, `/attachments`), queries, fragments, credentials,
  ports, encoded/invalid/overlong IDs, other origins, http, and https when no
  origin is configured. `src-tauri/src/search.rs` — the query cannot leave `q`.

## Browser (isolated QA API on 127.0.0.1:3188, Vite at `t18.localhost:5188`)

- Signed out at `/tasks/undated` → signed in as the fixture user → the task opened
  with its editor (post-login continuation).
- Sidebar **Search** opens Quick Find; "fixture" lists the five fixture tasks;
  "o" lists tasks, `Work` (Project) and `Doing` (Section); another user's task,
  project and section never appear.
- Choosing the `Doing` section from `/today` opens `/projects/qa-work#section-qa-doing`
  and focuses that section.
- "View all search results" → `/search?q=Fixture`, "5 results". Reloading
  `/search?q=inventory` (description-only match) → 1 result (refresh fallback in
  Vite). `/search?q=Another` → 0 results. `/tasks/other-private` → "Task not found".
- `openRoute("/tasks/future")` (the JS half of a native deep link) switched the
  mounted router to that task; `openRoute("/account")` was ignored; Back returned
  to the previous page.
- 390×844: /search and Quick Find fit without horizontal scroll.
- Copy link: the Browser pane denies clipboard writes, so the error path showed the
  legacy "The browser blocked copying…" message. The success path is unit-tested only.

## Not verified

- Native runtime: no iOS simulator or Mac run of `next_link`/`task_link`/search
  commands (other agents shared the simulator and the worktree's in-progress Ramble
  work did not typecheck at the time). Warm deep link, macOS cold launch and the
  clipboard inside WKWebView are untested; iOS cold launch is known to drop the URL
  (tao 0.37.1). Physical devices: none.
- Production hosting fallback and universal links (release items, see README).
