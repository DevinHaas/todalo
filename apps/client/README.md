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
  generated iOS Info.plist). No task routes.

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
- **Routes:** React Router `/today`, `/tasks/:id`, `/account`; unknown paths go to
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
- **Ticket 20 (provider events):** add an events read (its own key under
  `["user", id]`, invalidated by the live stream) and render events where the views
  mark "Ticket 20": first in each Upcoming day and month cell, all-day events in the
  all-day rows, timed events with `blockFor(start, end)` before task blocks. Events
  stay read-only links (legacy `EventRow`/`EventChip`/`TimedEventBlock`); the echo
  and visibility filters belong in the server query.

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
`QA_AMBIGUOUS_WRITES=1` applies each first create/completion and then answers
500, to watch the client retry without duplicating it.
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
It uses bundled assets. This is a local unsigned development artifact; no release
has been signed, notarized or published.

## Ramble recording

Signed-in users open Ramble from the sidebar (`/ramble`) to record and see live
transcription; saving tasks is ticket 21. Browsers connect same-origin (Vite
proxies `/api` WebSockets) with cookies and an exact Origin. Native shells call
`ramble_socket`: Rust mints a 30-second single-use ticket with the Keychain
bearer and returns only the ticketed socket URL. The disposable QA service runs
Ramble with a fake transcription provider; `scripts/ramble-smoke.ts` checks
both paths. `QA_API_PORT` moves it off 3009. Evidence: [ticket 6](../../docs/qa/tauri-ramble.md).

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
