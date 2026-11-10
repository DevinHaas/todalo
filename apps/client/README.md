# Shared Todalo client — account development slice

The browser, Mac and iOS shells share this React client: account screens, the app
sidebar shell, a read-only Today list and task detail (ticket 3). Email sign-in
and registration use the existing Better Auth account/session tables. Google
sign-in and account linking (ticket 4) go through the system browser.

## Run against your development API

From the repository root, start the existing API with `bun run --filter @todalo/api dev`.
Set `AUTH_TRUSTED_ORIGINS=http://localhost:5173` for both server hosts in development
while preserving the existing `BETTER_AUTH_URL`, secret and database. Multiple
trusted origins are comma-separated **exact** HTTP(S) origins. Do not use wildcards.

From this directory run `bun run dev`. Browser `/api` requests are proxied to
`http://127.0.0.1:3001`, overridden through `CLIENT_API_PROXY_TARGET`.
Production browser hosting must proxy `/api/auth/*` and `/api/v1/*` to Elysia
under the browser's origin and retain the legacy Google callback URLs. Ticket 25
owns deployment/cutover. Vite is a development server, not the production API.

For Mac development, add `$HOME/.cargo/bin` to PATH and run `bun tauri dev`.
`TODALO_API_BASE_URL` is a compile-time public native API origin. Debug builds
default to `http://127.0.0.1:3001`; debug HTTP is accepted only for loopback.
**iOS builds must use `TAURI_TODALO_API_BASE_URL` instead**: `tauri ios build|dev`
compiles Rust from an Xcode phase that only receives the Tauri CLI's forwarded
`TAURI*`/`WRY*`/`CARGO_*`/`RUST_*` variables (a `.cargo/config.toml` `[env]` entry
is not picked up there either). `build.rs` accepts either name, rejects empty or
conflicting values, and the iOS `beforeBuildCommand` fails if only the
unforwarded name is set. Check a build with `strings <app>/todalo | grep 127.0.0.1:30`.
Release builds require an explicit HTTPS origin and fail authentication closed
when none is configured. No native request follows redirects. Physical iPhone
development requires a reachable HTTPS API; loopback refers to the phone itself.

Native IPC exposes only `sign_in`, `sign_up`, `account`, and `sign_out` to the local
main webview. Rust reads and stores the signed session in Apple Keychain and
attaches bearer headers. There is no token getter, web storage fallback, or
general HTTP command. A failed server sign-out keeps the credential for retry;
user query caches are cleared when sign-out starts. Expired/revoked sessions are
removed after an account response returns 401.

## Google sign-in and linking (ticket 4)

- **Browser:** Better Auth's own `POST /api/auth/sign-in/social` and
  `/link-social` with `callbackURL` back to the initiating page
  (`?google=signed-in|linked|failed`, stripped on return). The session arrives as
  the usual HttpOnly cookie; the legacy `/api/auth/callback/google` is unchanged.
- **Native:** `google_start { intent }`, `google_finish`, `google_cancel` (in
  `src-tauri/src/oauth.rs`; the webview never sees a URL, code or token). Rust
  creates a 32-byte verifier and state, calls `POST /api/auth/native-oauth/begin`
  (bearer-authenticated for `link`), keeps `{state, verifier, intent, expiry}` in
  Apple Keychain, and opens the returned `/api/auth/native-oauth/authorize` URL in
  the **system browser** (Safari/default browser via the opener plugin; not a
  webview). That endpoint runs Better Auth's normal Google state/callback; then
  `/native-oauth/complete` (in the same browser) issues a 2-minute single-use code
  and shows a "Return to todalo" page that opens
  `app.todalo.client://oauth/callback?state=…&code=…` (or `&error=cancelled|not_linked|already_linked|failed`).
  Rust accepts it only for the pending state, deletes the pending flow before any
  network call, and exchanges `{code, verifier}` at `/native-oauth/exchange` for a
  signed session stored straight into Keychain. Replayed, forged or stale links
  are ignored; codes are consumed even on a wrong verifier.
- **Server:** `packages/auth/src/native-oauth.ts` is a Better Auth plugin, so both
  hosts that mount `auth.handler` (legacy Next and Elysia) serve it beside the
  existing Google callback. Attempts live 10 minutes, codes 2 minutes, both in
  the Better Auth `verification` table and consumed atomically. The browser
  session created by the Google callback is revoked before the code is issued.
- **Accounts are never merged silently:** Better Auth refuses implicit linking to
  an unverified email/password account (`not_linked`); the user signs in with the
  password and links Google from the account screen instead.
- **Deep links:** only the `app.todalo.client` scheme for `oauth/callback` is
  registered (`plugins.deep-link` in `tauri.conf.json`; CFBundleURLTypes in the
  generated iOS Info.plist). Ticket 18 added task links on the same scheme
  (`app.todalo.client://tasks/<id>`); see "Search and task links".

## Authenticated reads (ticket 3 conventions)

- **API:** `GET /api/v1/today` → `{ tasks: TaskDto[], openCount }` and
  `GET /api/v1/tasks/:id` → `{ task: TaskDto }` (`apps/api/src/task-routes.ts`).
  The user is always the session's (cookie or bearer); missing and other users'
  IDs both return `404 { code: "NOT_FOUND", message }`; no session is
  `401 { code: "UNAUTHENTICATED", message }`. Responses are `no-store`.
- **DTOs:** `packages/server/src/task-dto.ts` allow-lists fields; every date is an
  ISO-8601 UTC string or `null`, rendered in the viewer's local zone (legacy
  semantics). The client imports only its types.
- **Native:** each read is one fixed IPC command (`today`, `task { id }` in
  `src-tauri/src/reads.rs`) calling `NativeAuth::read(path)`. Add a new command
  per new read; never a path-taking or general HTTP command. IDs are validated
  in Rust before URL construction. Rust error strings must match `src/errors.ts`.
- **Query cache:** keys start with `["user", userId]` (`taskKeys` in
  `src/tasks.ts`); logout/account change clears the cache. Any `UNAUTHENTICATED`
  query error triggers `session.refresh()`, which signs out when the server agrees.
  Mutations (ticket 5) must invalidate `taskKeys.today(userId)` (it also feeds the
  sidebar count) and the affected `taskKeys.task(userId, id)`.
- **Routes:** React Router `/today`, `/tasks/:id`, `/settings/:section` (a modal over
  the screen it opened from; old `/account` links redirect); unknown paths go to
  `/today`. Signed-out screens keep the URL so the route opens after sign-in.

## Task writes (ticket 5 conventions)

- **Shared operations:** `createTask`, `completeTask`, `deleteTask` (and the
  calendar writes they trigger) live in `packages/server/src/tasks.ts`; the
  legacy Server Actions are thin wrappers that add `revalidatePath`. Schemas are
  in `packages/server/src/task-input.ts` (zod only, client-safe).
- **API:** `POST /api/v1/tasks` `{ id, title, description?, dueDate }` → `201 { task }`
  (`200` for a replay); `POST /api/v1/tasks/:id/complete` `{ occurrence }` →
  `{ task }`; `DELETE /api/v1/tasks/:id` → `{ id }`. Missing/foreign IDs are 404,
  bad bodies `400 INVALID_INPUT`, another user's operation ID `409 TASK_CONFLICT`.
  Bearer requests ignore cookies; cookie writes need an `Origin` in
  `allowedOrigins` (`RAMBLE_ALLOWED_ORIGINS` in production, so add
  `http://localhost:5173` there for browser development), otherwise `403`.
- **Retries:** the client-generated task `id` is the create operation ID (the
  primary key stores it; a replay repeats no side effect). Completion sends the
  due date the client saw as `occurrence`, so a replay cannot advance a recurring
  task twice; a done task stays unchanged; a repeated delete finds the task gone.
  Only `CONNECTION_FAILED`/`SAVE_FAILED` are retried (twice). The composer keeps
  its draft and operation ID until the server confirms.
- **Native:** `create_task`, `complete_task`, `delete_task` in
  `src-tauri/src/writes.rs`, using `NativeAuth::write`; bodies are rebuilt from
  typed fields and IDs validated in Rust.
- **Cache:** `taskMutations` (`src/tasks.ts`) applies completion and deletion
  optimistically to Today and its count, rolls back on failure, then invalidates
  `taskKeys.today` and `taskKeys.task`. Later write tickets should reuse it.
- **Completion feedback (ticket 7):** `src/feedback.ts` is the semantic adapter
  (`play("taskCompleted")`); `taskMutations` takes it and plays it in the
  completion's `onMutate`, alongside the optimistic check-off (once per tap, not
  per retry). It is fire-and-forget and swallows every error, so it can never
  delay or fail a write. On the iPhone/iPad app it invokes the single native
  `feedback` command (`src-tauri/src/feedback.rs`), which accepts only semantic
  events and plays a standard `UINotificationFeedbackGenerator` success through
  `tauri-plugin-haptics` (the webview has no `haptics:*` permission). Web and Mac
  use a no-op and show no setting. The opt-out is per device in `localStorage`
  (`todalo.haptics`, on by default) and lives on the Account screen. Reduced
  motion does not silence it; iOS applies its own System Haptics setting.

## Task edits and recurrence (ticket 11 conventions)

- **Shared operations:** the legacy edit is now `updateTask(userId, input, { seenUpdatedAt })`
  in `packages/server/src/tasks.ts` (fields, labels, organization, parent, calendar
  push when `dueDate` is in the edit); the Server Action only adds `revalidatePath`.
  Pure decisions live in `packages/server/src/task-rules.ts` (`planCompletion`,
  `editConflicts`) so the QA API runs the same rules. Tickets 13/14 should extend
  the API schema and call `updateTask`, not write their own update.
- **API:** `PATCH /api/v1/tasks/:id` with `taskDetailsInput` (`task-input.ts`:
  `updatedAt`, `title`, `description`, `priority`, `deadline`, `dueDate`,
  `dueDateEnd`, `recurrence`; strict, every field sent as the legacy dialog did)
  → `{ task }`. `POST …/complete` takes `{ occurrence, operationId }`. A stale
  copy answers `412 { code: "TASK_CHANGED" }` (409 stays `TASK_CONFLICT` for
  create). `TaskDto` now carries `recurrence` (`until` ISO or null) and `updatedAt`.
- **Recurrence (ADR 0001):** `nextOccurrenceOnCompletion` unchanged, in the
  server process's zone (both hosts must run the same `TZ`; legacy runs UTC).
  `dueDateEnd` is not moved on advance (legacy). Completion writes are a
  compare-and-set on `status`, `dueDate` and `lastCompletionId`, so concurrent
  taps advance once. `tasks.last_completion_id` (migration `0010`) stores the
  tap's operation ID: a retry after the task moved on is a no-op, a tap on a date
  another device changed is `TASK_CHANGED`. Without an operation ID the ticket 5
  silent no-op remains.
- **Edits:** refused as `TASK_CHANGED` when `updatedAt` differs, unless the task
  already holds every requested value (that is how a retried edit is recognised,
  so edits are retried like creates). The editor keeps the draft and offers
  "Load current details"; a pristine editor follows newer copies.
- **Native:** `update_task { id, details }` (typed fields only, bounded in Rust)
  and `complete_task { id, occurrence, operationId }` in `src-tauri/src/writes.rs`;
  412 maps to the `TASK_CHANGED` copy in `src/errors.ts`.
- **Client:** `taskMutations.complete` takes `{ task, operationId }` (one ID per
  tap via `operationId()`); `taskMutations.update` is not optimistic. Every task
  write now also invalidates `["user", userId, "project"]`. `TaskEditor`
  (`src/views.tsx`) is the legacy edit dialog without labels/link/attachments; it
  opens on the task page as legacy did. Date fields use native inputs read and
  written in the viewer's zone (`dateInputValue`, `timeInputValue`, `localInstant`).
- **Software keyboard:** `src/software-keyboard.ts` mirrors the visual viewport
  into `--keyboard-inset` (page bottom padding, fixed dialogs end above the
  keyboard and scroll), scrolls the focused field into view when the keyboard
  opens, and an opaque safe-area strip plus a sticky phone toolbar keep content
  from running under the status bar. Give any form that can unmount while focused
  `ref={releaseFocus}` (stops the stale iOS autocorrect bubble). Use 16px inputs.

## Projects and writes (ticket 8 conventions)

- **Todoist projects (migration 0045):** projects have `description`, `favorite`,
  `archived_at` and `view_settings` (the Display popover: layout, completed tasks,
  grouping, sorting and filters, saved per project via `PATCH /projects/:id`).
  `GET /projects` returns Completed/Open counts for My Projects; archived projects
  leave the sidebar and Move destinations. `PATCH /sections/:id` renames a section;
  `POST /projects/:id/sections` takes `after` to place it. Views: `project-views.tsx`
  (My Projects, list, board, table, Display); sub-projects are not built.

- **API:** `apps/api/src/project-routes.ts` — `GET /api/v1/projects` →
  `{ projects: ProjectDto[] }`; `GET /api/v1/projects/:id` →
  `{ project, tasks: TaskDto[] }` (all member tasks; the client hides completed);
  `POST /api/v1/projects` `{ name }` → `201 { project }`; `PATCH /api/v1/projects/:id`
  `{ name }` → `{ project }`; `DELETE /api/v1/projects/:id` → `{ id }`. Same 401/404
  envelope and `no-store` as reads. Invalid input is `400 { code: "INVALID_INPUT" }`.
  Deleting keeps member tasks (schema `SET NULL`: they move to Inbox) and cascades sections.
- **Write auth (CSRF):** a `Bearer` header authenticates on its own (cookies ignored);
  a cookie session must send an `Origin` in the allowed set (`RAMBLE_ALLOWED_ORIGINS`
  or the `BETTER_AUTH_URL` origin), else `403 { code: "FORBIDDEN_ORIGIN" }`.
  Non-JSON bodies fail validation, so form/`text/plain` posts cannot write.
- **Server logic:** `packages/server/src/projects.ts` (owner-scoped CRUD, shared with
  the legacy Next actions) and `project-dto.ts` (allow-listed DTO, `parseProjectName`).
- **Native:** fixed commands `projects`, `project { id }`, `create_project { name }`,
  `rename_project { id, name }`, `delete_project { id }` in `src-tauri/src/projects.rs`.
  Writes go through `NativeAuth::write(method, path, body)`; IDs use
  `reads::valid_id`, names are trimmed and bounded in Rust before a body is built.
- **Cache:** `projectKeys` in `src/projects.ts` (`["user", userId, "projects"]`,
  `["user", userId, "project", id]`); `projectMutations` invalidates the list on
  create/rename (plus the detail on rename) and, on delete, removes the detail and
  invalidates every `["user", userId]` key. `UNAUTHENTICATED` from a mutation also
  triggers `session.refresh()` (the `MutationCache` in `src/runtime.ts`).
- **Routes:** `/projects` (directory and create) and `/projects/:id` (tasks, rename,
  delete with in-page confirmation, since native `confirm()` is unreliable in iOS
  WKWebView). Deletion returns to `/projects` until Inbox (ticket 12) exists.

## Attachments (ticket 9 conventions)

- **API:** `apps/api/src/attachment-routes.ts` — `POST /api/v1/projects/:id/files`
  (multipart `files`, one task per file, legacy limits) → `201 { tasks: [{ id, title }] }`;
  `GET /api/v1/tasks/:id/attachments` → `{ attachments: AttachmentDto[] }`;
  `GET /api/v1/attachments/:id` → the bytes as a forced, sandboxed download. Same
  401/404/403 rules as project writes; `400 INVALID_INPUT`, `413 FILES_TOO_LARGE`.
- **Server logic:** `packages/server/src/attachments.ts` (owner-checked create/list/read,
  shared with the legacy Next routes), `attachment-http.ts` (bounded body read, our
  own multipart parser — Bun's `formData()` replaces each part's type with an
  extension guess — and the download response) and `attachment-limits.ts`
  (client-safe limits and DTOs). Storage stays the `task_attachments` row (base64),
  so legacy rows need no migration and no bucket or key is involved.
- **Native:** `attachments { id }`, `upload_files` and `save_attachment { id, name }`
  in `src-tauri/src/attachments.rs`. Upload sends the files back to back as one raw
  IPC body with `x-todalo-project` and an ASCII-JSON `x-todalo-files` header; Rust
  re-checks every limit and frames the multipart body (`NativeAuth::upload`).
  Downloads are fetched in Rust (`NativeAuth::download`, size-capped) and written
  without overwriting to Downloads (Mac) or Documents (iOS, shown in Files under
  On My iPhone › todalo); the webview receives only `{ name, location }`. No URL or
  path ever carries the bearer. `dragDropEnabled: false` lets HTML5 drops reach the page.
- **Client:** `src/attachments.ts` (`attachmentKeys.task` sits under the task key;
  uploads validate first, then invalidate only `projectKeys.detail`), pure views in
  `src/attachment-views.tsx` (picker label, paste outside text fields, drop, retry
  only for interrupted saves), runtime glue in `src/attachment-screens.tsx`.

## Sections and sub-tasks (ticket 13 conventions)

- **Server logic:** `packages/server/src/organization.ts` (sections, destinations,
  legacy multi-task `moveTasks`, `setTaskParent`); the legacy organization actions
  only add `revalidatePath`. Zod schemas in `organization-input.ts` (client-safe).
  `TaskOrganizationError` (`@todalo/db/task-organization-validation`) carries
  `reason: "missing"` (absent or another user's project/section/parent → 404) or
  `"invalid"` (own parent, sub-task of a sub-task, nesting a task with sub-tasks → 400);
  messages are the legacy ones.
- **One task's move or parent change is an `updateTask` edit**, sent to
  `PATCH /api/v1/tasks/:id` as `{ updatedAt, projectId, sectionId }` or
  `{ updatedAt, parentId }` (strict union beside `taskDetailsInput`, never both; Inbox is
  `projectId: null` with no section). Same stale check (412) and replay rule as edits.
  Legacy invariants: a moved parent carries its sub-tasks, a sub-task moved on its own
  becomes a root, nesting joins the parent's project and section, one level only.
  The legacy move has no ordering, so no dedicated command was needed; ticket 15's bulk
  move should expose `moveTasks` (several IDs, same carry/detach rules) as its own
  owner-checked command, and own ordering (`sortOrder`) there.
- **API:** `GET /api/v1/destinations` → `{ projects: [{ id, name }], sections }`;
  `GET /api/v1/projects/:id` now includes `sections: SectionDto[]` (legacy order) and
  every `TaskDto` has `sectionId`; `POST /api/v1/projects/:id/sections { name }` →
  `201 { section }`; `DELETE /api/v1/sections/:id` → `{ id }` (tasks stay in the
  project, unsectioned). Write auth as project writes.
- **Native:** `destinations`, `create_section { projectId, name }`,
  `delete_section { id }`, `organize_task { id, change }` in
  `src-tauri/src/organization.rs`; `change` must be exactly a move or a parent change
  (Rust rebuilds the body, rejects anything else as `INVALID_INPUT` copy).
- **Client:** `src/organization.ts` (`organizationKeys.destinations` =
  `["user", id, "destinations"]`, `organizationMutations`, `parentCandidates`).
  Organize and section delete invalidate Today, every `["user", id, "task"]` and
  `["user", id, "project"]` key (sub-tasks move too); section create invalidates the
  project and destinations. Not optimistic, retried like edits. Touch UI: Move task /
  Nest task / Unnest task on the task page (`TaskOrganizer`), Add section and per-section
  collapse/Delete section on the project page (`sectionGroups`, `SectionHeader`).
  Board layouts (ticket 17) should group by `sectionGroups` and move cards between
  sections with `organize` (`{ projectId, sectionId }`).

## Upcoming, calendar and schedule (ticket 16 conventions)

- **One read:** `/upcoming`, the month/week calendar and Today's schedule all use
  `reads.today` (the full owned-task collection, legacy `getTasksForUser`). Do not
  add a parallel task read for a date view; any write that settles Today refreshes
  them. Rescheduling from a view opens `TaskEditor` and saves via `taskMutations.update`.
- **Dates:** `src/schedule.ts` holds the legacy date-fns rules (local `dayKey`,
  Monday weeks, Sunday month grid, `blockFor`, `slotAt`, `upcomingSections`).
  Group anything dated by `dayKey(new Date(iso))` in the viewer's zone, never the
  UTC date; format per call (a cached `Intl.DateTimeFormat` pins its zone).
- **Display settings:** `DisplayProvider`/`useDisplay` (`src/schedule-views.tsx`)
  wrap the shell; in memory like legacy. Ticket 17 adds `board` to `nextLayout`
  and activates the inert Board option.
- **Provider events:** done in ticket 20; see the next section.

## Connected calendars and the live stream (ticket 20 conventions)

- **Events read:** `calendarReads.events` (`["user", id, "calendar", "events"]`,
  `GET /api/v1/calendar/events`, `useCalendarEvents`). Never a second task read.
  Screens pass `events` to `TodayView`, `UpcomingList`, `CalendarView` and
  `TodaySchedule`; events render first, as read-only links (`EventRow`,
  `EventChip`, `EventBlock` in `src/calendar-views.tsx`). Group with
  `eventDayKey`: timed events by the local day of the start instant, all-day
  events by the calendar date Google gave (stored as UTC midnight; this fixes
  legacy showing them a day early west of UTC). Natively, `openEvent` opens the
  link in the system browser through `open_calendar_event`, which accepts only
  `https://www.google.com` / `calendar.google.com`.
- **Server:** `packages/server/src/calendar-connections.ts` (events with the
  visibility and echo filters, account list, show/hide, resync, disconnect) and
  `calendar-sync.ts` (Google sync, watch channels, `handleCalendarWebhook`).
  Legacy Server Actions, the settings page and both webhook routes are wrappers.
  Provider tokens stay in Better Auth's account store; log provider errors only
  through `logSafe` (gaxios errors carry the bearer header).
- **Settings:** the Calendars section of the Account screen
  (`CalendarSettingsScreen`) under `["user", id, "calendar", "accounts"]`; toggles
  are optimistic with rollback; every write invalidates `["user", id, "calendar"]`
  and publishes `calendar` to the user's other devices. Linking uses the ticket 4
  `GoogleButton intent="link"` (system browser natively); Better Auth's Google
  provider requests the Calendar scopes, so a link grants calendar access.
- **Live stream contract (ticket 22 extends it):** `GET /api/v1/stream`,
  `text/event-stream`, authenticated by the browser cookie (same origin; no CORS
  headers, so other sites cannot read it) or the bearer that Rust attaches. Frames:
  `event: ready` with `data: {}` once per connection, then
  `event: change` with `data: {"topic":"<topic>"}`, plus `: heartbeat` comments
  every 25 s. Server side, call `publish(userId, topic)` from
  `@todalo/server/live`; add the topic to `LiveTopic` (`calendar-input.ts`).
  Client side, map the topic to query keys in `liveTopicKeys` (`src/calendar.ts`);
  unknown topics are ignored, so deploy the server first. `startLiveUpdates`
  (mounted once by `LiveUpdates` in the shell) refetches every topic on `ready`
  (connect and reconnect) and when the app becomes visible again, and reconnects
  on resume because iOS may have dropped the socket silently. It retries with
  backoff (1, 2, 5, 15, 30 s); `UNAUTHENTICATED` re-checks the session instead.
- **Native stream:** a WebView `EventSource` cannot carry the Keychain bearer, so
  `live_stream` (Rust) opens the stream itself and forwards only parsed
  `ready`/`change`/`closed` messages over a Tauri `Channel`. There is one stream
  per app: opening another or `stop_live_stream` aborts the last. No ticket and
  no CSP change are needed, because the token never leaves Rust.
- **One process:** the bus in `live.ts` is process-local, so the Google webhook and
  the streams must run in the same API process (`GOOGLE_WEBHOOK_BASE_URL` +
  `/api/calendar/webhook` must reach the API). Add shared pub/sub before running
  more than one API instance. The legacy Next webhook path still works and
  notifies legacy browsers in its own process.

## Smart quick add and settings (ticket 12 conventions)

- **Shared parsing:** the composer uses the legacy modules unchanged:
  `@todalo/ramble/quick-add` (parser), `@todalo/ramble/quick-add-sync` (last-touch-wins
  field sync and `highlightSegments`, moved from `apps/web/lib`, which re-exports it).
  `src/quick-add.ts` only adapts them to ISO DTOs (`parseTitle`, `quickAddTask`).
  Anything that turns typed text into a task (keyboard commands, ticket 19; Ramble
  staging, ticket 21) should call these rather than parse again.
- **Composer:** `src/composer.tsx` (re-exported from `views.tsx`) is the legacy
  TaskComposer: transparent input over a highlight backdrop (ADR 0002), click/tap a
  highlight to reject it for the draft, date pill panel (quick dates, date, time range,
  Repeat, legacy Custom repeat dialog). A manual pick rewrites the phrase to its
  canonical text. Props: `dueDate`/`dueDateEnd` seed the date and time range,
  `destination` labels the pill while the seed is kept.
- **Create API:** `POST /api/v1/tasks` also takes `dueDateEnd` and `recurrence` (ADR 0001,
  `until` ISO or null); an end time without a due date is `400`. `NewTask` and the native
  `create_task` carry both (omitted when unset).
- **Setting:** `GET /api/v1/settings` → `{ settings: { smartDateRecognition } }` (on when
  the account has no row); `PATCH /api/v1/settings` `{ smartDateRecognition }` (strict;
  `writeUser` guard). Shared logic: `packages/server/src/settings.ts` (legacy
  `lib/settings.ts` and the Server Action wrap it); schema/DTO in `settings-input.ts`.
  Native: `settings` and `update_settings` in `src-tauri/src/settings.rs`.
- **Client:** `settingsKeys.settings(userId)` = `["user", userId, "settings"]`;
  `settingsMutations.update` flips optimistically, retries ambiguous failures and rolls
  back. `SmartDatesProvider` (in `App.tsx`) feeds the `SmartDates` context every
  composer reads — it is **off until the setting has loaded**, so an opted-out user never
  gets a date from a draft typed during startup. The switch is on the Account screen.

## Labels and saved filters (ticket 14 conventions)

- **Server logic:** `packages/server/src/metadata.ts` (owner-scoped label and
  saved-filter CRUD, shared with the legacy metadata actions, which only add
  `revalidatePath` and keep their error messages) and the client-safe
  `metadata-input.ts` (`filterDefinitionSchema`, `matchesSavedFilter`, input
  schemas, DTOs, `MissingReferenceError`). Stored `saved_filters.definition` rows
  are only ever *parsed* (legacy rows omit `status`/`due`); they are never rewritten.
- **API:** `apps/api/src/metadata-routes.ts` — `GET /api/v1/metadata` →
  `{ labels, filters }` (sorted by name; projects come from `/projects`);
  `GET /labels/:id` → `{ label, tasks }`; `GET /filters/:id` → `{ filter, tasks }`
  (evaluated on the server in its zone, as the legacy page; every matching task,
  completed included); `POST /labels` `{ id, name, color? }` and `POST /filters`
  `{ id, name, definition }` (client UUID: `201`, a replay `200`, another user's ID
  `409`); `PATCH`/`DELETE` by ID. One `404 NOT_FOUND` for missing and foreign IDs.
  A filter naming a deleted or foreign label/project is `400 INVALID_INPUT`.
  Deleting a label cascades it off tasks; filters naming it stay and match nothing.
- **Label assignment:** `taskDetailsInput.labelIds` (optional full set, `[]` clears)
  through `PATCH /api/v1/tasks/:id` and `updateTask`. Labels join the stale-edit
  check as a sorted set. A deleted/foreign label throws `MissingReferenceError`,
  which task and metadata routes map to `400 INVALID_INPUT` — bulk metadata
  (ticket 15) should reuse `assertOwnedLabels`/`replaceTaskLabels` and that mapping.
- **Native:** `metadata`, `label`, `saved_filter`, `create_label`, `update_label`,
  `delete_label`, `create_filter`, `update_filter`, `delete_filter` in
  `src-tauri/src/metadata.rs` (typed bodies, names 1–100, `#rrggbb`, IDs via
  `valid_id`, create IDs via `valid_operation_id`); `update_task` takes `labelIds`.
- **Client:** `src/metadata.ts` (`metadataKeys` under `["user", id, "metadata"]`;
  `metadataMutations` refresh that prefix, and deleting a label refreshes every
  user key). Task writes also invalidate the metadata prefix, so label/filter
  task lists and counts follow. Views in `metadata-views.tsx`, screens in
  `metadata-screens.tsx`; routes `/labels`, `/labels/:id`, `/filters`,
  `/filters/:id`. `TaskEditor` takes `labels` and sends only labels still in the list.
- **QA fixtures:** labels `Design`/`Urgent`, legacy-shaped filters (including one
  naming a deleted label) and another user's label/filter
  (`/labels/qa-other-label`, `/filters/qa-other-filter`).

## Filters & Labels (Todoist model)

- **Queries:** `packages/server/src/filter-query.ts` parses and evaluates
  Todoist filter queries (operator list: `docs/filter-queries.md`). A
  `saved_filters` row has a `query` *or* a ticket-14 `definition` (migration
  `0044_filter_queries`: `query`, `description`, `color`, `favorite`,
  `sort_order`; `definition` nullable; labels gain `favorite`, `sort_order`).
  Legacy rows keep evaluating with `matchesSavedFilter`; the dialog pre-fills
  `definitionToQuery` and saving converts the row to a query. A legacy write
  (old web form) clears any query. `GET /filters/:id` adds `groups` (one per
  comma-separated list) for query filters; queries never list completed tasks.
- **Filter Assist:** `POST /api/v1/filters/assist` `{ description }` (native
  `assist_filter`) uses the Coach's provider (`filter-assist.ts`) and returns
  `{ query }` only when the parser accepts it, else `{ query: null, message }`.
- **UI:** `/filters` and `/labels` show the Filters & Labels page; Add/Edit label
  and filter dialogs (60-char names, Todoist's named colours, favorites, live
  preview over the cached tasks); favorites appear in the sidebar's Favorites.
  Evidence: `docs/qa/filters-labels.md`.

## Search and task links (ticket 18 conventions)

- **Shared rules:** `packages/server/src/search.ts` (pure, no DB) is the legacy
  behavior and is used by the legacy Next page/dialog, the API and the QA server:
  `searchTasks` (/search page: case-insensitive substring of `"title description"`,
  sortOrder, empty query = all tasks; `searchQuery` cuts `q` to 200), `findItems`
  (Quick Find candidates: tasks, projects by name, sections; legacy hrefs including
  `/projects/<p>#section-<s>`) and `matchFindItems` (title-only, max 40, optional
  sections-only "Navigate sections" mode). No ranking exists in legacy; none added.
  Saved filters are a separate path (`matchesSavedFilter`) and are not involved.
- **API (read-only, owner-scoped, `no-store`):** `GET /api/v1/search?q=` →
  `{ query, tasks: TaskDto[] }`; `GET /api/v1/find` → `{ items: FindItem[] }`
  (`apps/api/src/search-routes.ts`). Only the session user's rows reach them.
- **Native:** `search_tasks { query }` (Rust URL-encodes `q`, ≤ 200 chars) and
  `quick_find` in `src-tauri/src/search.rs`.
- **Client:** `src/search.ts` (`searchKeys` under `["user", id, "search"]`; task
  writes invalidate it), `search-views.tsx`, `search-screens.tsx`. The sidebar
  **Search** button opens Quick Find (`data-quick-find`, the legacy hook — keyboard
  shortcuts `/`, `f`, `Primary+k` and "Navigate sections" in ticket 19 should open
  the same dialog, e.g. by clicking `[data-quick-find]` or lifting Shell's
  `finding` state; `QuickFindDialog` already takes `sectionsOnly`). Route
  `/search?q=` keeps the query in the URL. Search results use the list layout only.
- **Task links:** `/tasks/:id` (legacy URL, `encodeURIComponent(id)`). Signed-out
  screens keep the URL, so a link opens after sign-in; unknown or another user's
  IDs show "Task not found" (404). `TaskEditor` takes `shareUrl` and shows the
  legacy "Task link · Copy link" row: the browser copies `location.origin` +
  path; native gets `task_link { id }` → `<API origin>/tasks/<id>` (https in
  release; never the custom scheme). The URL is resolved before the tap because
  WebKit drops the clipboard gesture across an await.
- **Native deep links:** `src-tauri/src/links.rs` accepts only
  `app.todalo.client://tasks/<id>` and `https://<API origin>/tasks/<id>` (exact
  origin; for future universal links) with a `valid_id` ID and no query, fragment,
  credentials or port. Rust keeps the latest accepted route; the webview awaits it
  with `next_link` (`followNativeLinks` in `src/links.ts`, started in `main.tsx`)
  and pushes it into history — navigation only, never a write. Cold launch works
  where the plugin delivers the URL (macOS); **iOS cold launch drops it** (tao
  0.37.1, as with OAuth) and the user taps the link again. To add another route,
  extend the Rust allow-list and `LINK_ROUTE` together.
- **Production (release items):** serve the browser client's routes at the API
  origin (shared https links point there) with an HTML fallback for
  `/tasks/*`, `/search` etc. that never swallows `/api/*` or assets; for universal
  links add `plugins.deep-link.mobile` `{ scheme: ["https"], host, pathPrefix:
  ["/tasks"], appLink: true }`, the Associated Domains entitlement
  `applinks:<host>` (paid team) and `/.well-known/apple-app-site-association`.

## Reorder and bulk actions (ticket 15 conventions)

- **Server logic:** `packages/server/src/bulk.ts` (`completeTasks`, `deleteTasks`,
  `clearTaskDates`, `updateTasksMetadata`, `reorderTask`) and `organization.moveTasks`;
  the legacy `bulkTaskAction`/`bulkTaskMetadata` actions only add `revalidatePath`.
  Schemas and the pure `planReorder` live in the client-safe `bulk-input.ts`. Every bulk
  operation loads the whole selection owner-scoped first and writes nothing unless every
  ID is the user's. Multi-row writes go through `atomically` (`db.batch`, one neon-http
  transaction): metadata (fields + label replacement), move (move, detach, order) and
  reorder. Complete/clear-date/delete keep legacy per-task calendar effects.
- **Order:** every task read sorts by `manualOrder` (`sortOrder`, `createdAt`, `id`,
  `today.ts`). `reorderTask(id, { anchorId, position: "before" | "after" })` places a task next to
  another of the same project (or Inbox) *relative to the current server order* and
  renumbers that whole collection 0…n−1 in one batch: a retry rewrites the same numbers,
  concurrent reorders leave one complete order, and only `sortOrder` changes (no
  `updatedAt`, so open editors stay valid). Bulk moves append the selection to the end
  of the destination in its current order. `TaskDto` still carries no `sortOrder`: the
  client keeps the server's array order.
- **API:** `apps/api/src/bulk-routes.ts` — `POST /api/v1/bulk/complete`
  `{ operationId, tasks: [{ id, occurrence }] }` → `{ completed, changed }`;
  `POST /bulk/delete` and `/bulk/clear-date` `{ ids }`; `/bulk/metadata`
  `{ ids, priority? | deadline? | labelIds? }`; `/bulk/move` `{ ids, projectId, sectionId }`
  → `{ ids }`; `POST /tasks/:id/reorder` `{ anchorId, position }` → `{ id }`. 1–200 IDs,
  strict bodies. A missing/foreign task or destination anywhere in the selection is one
  `404` with nothing written; a deleted/foreign label or a cross-collection anchor `400`.
  The reorder body may also (or instead) carry `status` — see ticket 17 below.
  Write auth as every task write.
- **Native:** `bulk_complete`, `bulk_delete`, `bulk_clear_date`, `bulk_metadata`
  (`change` must set exactly one field), `bulk_move`, `reorder_task` in
  `src-tauri/src/bulk.rs`.
- **Client:** `src/bulk.ts` (`bulkMutations`, `reorderAnchor`, `reorderTasks`). Complete,
  delete and clear-date are optimistic on Today and every open project list with
  rollback; metadata and move wait (legacy dialogs). All settle Today, every
  `["user", id, "task"]`, `["user", id, "project"]` and `["user", id, "metadata"]` key.
  Retries as task writes (one `operationId` per bulk completion tap; a retried delete
  answered 404 counts as applied). Views in `bulk-views.tsx`; screen glue in
  `bulk-screens.tsx` (`useBulkSelection(userId, visibleTasks)` → `SelectionSlots`,
  `useReorder`). Today and project pages take `selection`; the project page takes
  `reorder` (drag within a section; a sub-task stays with its parent).
- **For ticket 19 (keyboard):** selection is `useSelection(visibleIds)` (`toggle(id)`,
  `start`, `stop`, `drop`; IDs that leave the view drop out like legacy `setVisible`).
  Bind X to `toggle(focusedId)` and `,` to focusing `[role="toolbar"][aria-label="Selected
  task actions"]`; reuse `BulkActions`/`bulkMutations` for task.complete/delete/clear-date,
  priority 1–4, deadline and labels on a selection, and `moveTasks` (`bulk.move`) for V.
- **Drag primitives:** `SortableTasks` (`ids`, `label`, `onReorder(id, overId,
  position)`) and `SortableRow` (grip handle; pointer with a 5 px threshold, so touch
  and WKWebView work via pointer events with `touch-action: none`; keyboard Space/arrows
  with titled announcements) wrap any vertical list; `useDragSensors` and
  `dragAnnouncements(label)` are shared with the board.

## Layouts and the status board (ticket 17 conventions)

- **Layouts:** Display (`useDisplay`, shell-wide and in memory like legacy) cycles
  list → board → calendar with the toolbar arrows (`nextLayout`) or the Display dialog.
  Today (`TodayView`'s `calendar` slot renders any non-list layout), Upcoming and project
  pages honour it. A project's Board/Calendar get the tasks Display shows (completed
  only when switched on, legacy `ProjectView`); Today and Upcoming boards get the whole
  collection, done included (legacy). `ProjectView` takes `layout(tasks)` in place of the
  section list; the project calendar's slot clicks are inert until projects can create
  tasks. Label, filter and search pages still render only their list.
- **Board:** `StatusBoard` (`board-views.tsx`, pure) — legacy To do / In progress /
  Done columns (`boardColumns`), cards in `treeOrder`, title opens the editor.
  `BoardScreen` (`board-screens.tsx`) wires `useReorder(userId).move` and `TaskEditor`.
  Cards drag only by their grip (pointer or keyboard Space/arrows/Space, Escape
  cancels; focus returns to the grip after a keyboard move), so swiping a card scrolls
  the board, which scrolls sideways on phones (`.board`, columns ≥ 14rem).
- **Writes:** one command, `POST /api/v1/tasks/:id/reorder` with `{ anchorId, position }`,
  `{ status }` or both (native `reorder_task` with optional `anchorId`/`position`/
  `status`). `boardDrop(tasks, id, overId)` maps a drop: another column (or a card in
  it) → `{ status }`, which sets the status and appends to the task's collection
  (`planReorder` with a null anchor); same column → next to the card, same collection
  only (Today/Upcoming boards mix projects). The status change and renumbering commit
  in one batch; a status change moves `updatedAt`, renumbering keeps it
  (`updatedAt: sql\`${tasks.updatedAt}\`` — drizzle's `$onUpdate` would otherwise bump
  every row, now modelled by the test boundary). The legacy web `reorderTask` Server
  Action is untouched. Optimistic on Today and project lists with rollback; settles
  like every bulk write (now including `["user", id, "search"]`).
- **For ticket 19 (keyboard):** board cards carry `data-task-id` and live in
  `[data-task-column="todo" | "in_progress" | "done"]` columns (legacy hooks); move a
  focused card between columns with `useReorder(userId).move(task, { status })` rather
  than a new write path. Layout cycling is `display.set({ layout: nextLayout(layout) })`.

## Isolated manual QA

Avoid production account/database changes. From this directory:

```sh
bun --no-env-file scripts/auth-smoke-server.ts
CLIENT_API_PROXY_TARGET=http://127.0.0.1:3009 bun run dev
```

The in-memory service seeds `existing@example.test` with `dev-password-123`, plus
fixture Today tasks and a second user's private task (`/tasks/other-private`) for
cross-user checks. Projects: `Work` (three fixture tasks), `Errands` (empty) and a
second user's project (`/projects/qa-other`). Attachments: `/tasks/undated` carries a legacy-format
`Legacy brief.txt`; the other user's `qa-other-file` checks download ownership. Set `QA_CLIENT_ORIGIN` when Vite runs
on a port other than 5173 (it is the trusted auth origin and the allowed write origin). `QA_EMPTY_TODAY=1` starts it with no tasks for the seeded user.
Calendars (ticket 20, `scripts/qa-calendar.ts`): a stub Google gives the seeded user a linked account
(Personal and Work shown, Birthdays hidden), an account without calendar access and an echo of a pushed task
(filtered); `POST /api/qa/calendar/provider-change` adds a Work event and delivers Google's webhook, so open
screens update through the live stream.
`QA_AMBIGUOUS_WRITES=1` applies each first create/completion and then answers
500, to watch the client retry without duplicating it.
`QA_SETTINGS_SAVE_FAILS=1` answers every settings save with a 500 (switch rollback).
All these records disappear on service restart. It imports no production DB or
auth singleton. Registration can create additional disposable QA accounts.
Google is faked (`apps/api/src/fake-google.ts`): authorization redirects go to a
local consent page at `/api/fake-google/authorize` (consent as
`google-qa@example.test`, as `existing@example.test`, or cancel) and the token
endpoint returns an unsigned ID token. Real Google is never contacted.

To build a local Mac app against that service:

```sh
TODALO_API_BASE_URL=http://127.0.0.1:3009 bun tauri build --debug --bundles app --ci
# iOS simulator: note the TAURI_ prefix
TAURI_TODALO_API_BASE_URL=http://127.0.0.1:3009 bun tauri ios build --debug --target aarch64-sim --ci
```

The resulting app lives under `src-tauri/target/debug/bundle/macos/todalo.app`.
Unsigned (ad-hoc) Mac builds get a new code hash on every build, so Keychain asks for
the login password again each time. Add `APPLE_SIGNING_IDENTITY="Apple Development: …"`
(any Apple Development identity from `security find-identity -v -p codesigning`) to
keep one "Always Allow" across rebuilds.
It uses bundled assets. This is a local unsigned development artifact; no release
has been signed, notarized or published.

## Ramble recording

Signed-in users open Ramble from the sidebar or a composer's waveform
(`/ramble?date=YYYY-MM-DD` seeds the legacy default due date). The screen is the
legacy modal: the microphone starts with the session, pauses and resumes, staged
cards can be removed, and **Add tasks** (or a spoken "done") saves the batch;
Discard, Escape or leaving the screen abandons it. As the legacy modal
([Ramble mode](../../docs/ramble-mode.md)): listening starts with the microphone (audio
queues until the provider is ready), the wave is a live loudness history from the
capture's `AnalyserNode`, the server's `provisionalIds` cards (local quick-add guesses)
are dimmed and not removable until the model confirms them, and cards show spoken
description, priority, deadline and label count. Only confirmed tasks are ever saved,
including by the HTTP fallback. Browsers connect same-origin (Vite
proxies `/api` WebSockets) with cookies and an exact Origin; against a dev API add
`http://localhost:5173` to `RAMBLE_ALLOWED_ORIGINS`, or the socket is refused (`403`). Native shells call
`ramble_socket`: Rust mints a 30-second single-use ticket with the Keychain
bearer and returns only the ticketed socket URL. The disposable QA service runs
Ramble with a fake transcription provider; `scripts/ramble-smoke.ts` checks
both paths. `QA_API_PORT` moves it off 3009. Evidence: [ticket 6](../../docs/qa/tauri-ramble.md).

### Committing a session (ticket 21 conventions)

- One session = one socket + one client-generated `operationId` (UUID), sent in
  the `start` options. The server derives every task ID as
  `sha256(userId, operationId, stagedId)` (`apps/api/src/commit-rows.ts`) and
  inserts only missing rows, so any replay of a commit — over the socket after
  `save_failed`, or over HTTP — writes each task at most once.
- The socket holds the staged batch (ADR 0005). If it closes during a save, the
  client replays the last published batch with `POST /api/v1/ramble/commit`
  (`{ operationId, timeZone, todos }`, strict `rambleCommitInput` from
  `@todalo/ramble/commit`; native `ramble_commit`). If it closes earlier, the
  cards stay, marked unsaved, and Add tasks uses the same HTTP save. Success is
  shown only after `committed` or a 200; ambiguous failures say the save could
  not be confirmed and keep the cards.
- Destinations come from the batch: projects must be the user's (404 otherwise),
  parents must be in the batch and one level deep (400). Smart dates are the
  account setting the server reads; the client also sends `smartRecognition`.
- After a save the client invalidates every `["user", id]` query.
- Interruptions (backgrounding, microphone loss) stop capture and keep the
  socket and cards; **Resume** continues the same session.

## Apple project and verification

The provisional identifier `app.todalo.development` is only for development;
it makes no claim to a registered domain or App Store identifier. Choose the
release identifier after Apple membership is active. No team ID is committed.
The generated `src-tauri/gen/apple` project is checked in without build products.
`bun tauri ios init --ci --skip-targets-install` can regenerate it after toolchain
setup; the CLI may install XcodeGen and mobile-device utilities using Homebrew.
Set `APPLE_DEVELOPMENT_TEAM` only after selecting the actual enrolled team.

Current **candidate**, unverified minimum targets: macOS 12 and iOS 15.4.
Only arm64 Mac and arm64 iOS-simulator compilation have evidence so far.
Physical iPhone and signed Mac session/lifecycle validation remain required.
See [ticket 2 evidence](../../docs/qa/tauri-account-auth.md).

```sh
bun run test
bun run typecheck
bun run build
cd src-tauri
cargo test --locked
cargo check --locked --target aarch64-apple-ios-sim
# Manual OS test: unique synthetic credential, removed before returning.
cargo test --locked apple_keychain_round_trip_and_removal -- --ignored
```
