# Todoist import

Status: ready-for-agent (decisions agreed 2026-11-06)

## Goal

A user can bring their Todoist data into todalo: connect Todoist with OAuth,
choose what to import, and get a summary. It lives in Settings (`/account`) and
is offered once right after a new account is created. Built in the shared
client (`apps/client`, browser + Mac + iOS) and `apps/api`; the legacy Next app
(`apps/web`) is out of scope (being retired, ticket 28 of tauri-migration).

## Decisions

- **Auth: Todoist OAuth** ("Connect Todoist"), not pasted tokens.
  - A Todoist app must be registered at https://developer.todoist.com/appconsole.html
    with redirect URL `<BETTER_AUTH_URL>/api/v1/imports/todoist/callback`
    (dev: `http://localhost:3000/...`, prod: `https://todalo.bleat.ch/...`).
  - Env: `TODOIST_CLIENT_ID`, `TODOIST_CLIENT_SECRET`. Scope `data:read` only.
  - The whole flow is **server-side**: the access token never reaches any client,
    URL or log. Native clients only open the authorize URL in the system browser
    (same pattern as Google, ticket 4 of tauri-migration), then refetch on focus.
- **User chooses what to import** before anything is written:
  - per Todoist project (checkbox list with active-task counts; Inbox included)
  - categories: sections, sub-tasks, labels, recurring schedules, comments
    (appended to task description), completed tasks
- **Re-import skips already imported items.** A mapping table records
  `(userId, provider, kind, externalId) → localId`. A re-run only adds new items
  and never updates or duplicates existing ones. Deleting the local item
  removes its mapping (FK cascade), so it can be re-imported.

## Flow

1. `POST /api/v1/imports/todoist/connect` (session/bearer) → creates an import
   session `{id, userId, state, expiresAt (10 min)}` and returns the Todoist
   authorize URL (`https://app.todoist.com/oauth/authorize?client_id&scope=data:read&state`).
2. Client opens it: browser via `window.location`, native via the opener plugin
   scoped to `https://app.todoist.com/oauth/authorize*` only.
3. `GET /api/v1/imports/todoist/callback?code&state` (no session; state-bound,
   single-use, expiring) exchanges the code at `https://api.todoist.com/oauth/access_token`
   and keeps the token on an in-memory import session (never persisted; revoked at Todoist
   after a run, on disconnect or expiry). Renders a "Return to todalo" page; native gets
   `app.todalo.client://import/todoist` deep link; browser redirects to `/account#import`.
   Denial/errors render the same page with an error and mark the session failed.
4. `GET /api/v1/imports/todoist` → latest session status for the user:
   `idle | connected | running | done | failed` plus, when connected, a **preview**
   from one `POST https://api.todoist.com/api/v1/sync` (`sync_token=*`,
   `resource_types=["projects","sections","items","labels","notes"]`):
   projects with counts, label/recurring/comment counts, and how many are already imported.
5. `POST /api/v1/imports/todoist/run` `{ projectIds[], include: {sections, subtasks, labels, recurring, comments, completed} }`
   → imports in one transaction, records mappings, deletes the token, returns a
   summary `{created: {projects, sections, tasks, labels}, skipped, warnings[]}`.
   Completed tasks come from `GET /api/v1/tasks/completed/by_completion_date`
   (paged, max range per request per Todoist docs).
6. `DELETE /api/v1/imports/todoist` cancels/forgets a pending session.

## Mapping rules (pure, unit-tested)

- Project nesting is flattened: child project → own todalo project named
  `Parent / Child`. Colors use Todoist's palette hex values.
- Todoist Inbox → todalo Inbox (tasks with `projectId = null`), not a new project.
- Sub-tasks: todalo allows one level. Depth ≥2 attaches to the top-level
  ancestor (title kept), with a warning count. Sub-tasks off → imported as
  top-level tasks.
- Priority: Todoist API `4`(p1)…`1`(p4) → todalo `1…4` (`5 - p`).
- `due.date` date-only → all-day due date; with time → `dueDate` in
  `due.timezone` or the user's timezone. `duration` → `dueDateEnd`.
  `deadline.date` → `deadline`.
- Recurring (`due.is_recurring`): parse `due.string` with the existing
  smart-quick-add parser (`@todalo/ramble`) into `Recurrence`; unparseable or
  recurring off → one-off date + warning.
- Labels by name, case-insensitive match against existing todalo labels (reuse,
  no duplicate label).
- Order: `child_order` / `order_key` → `sortOrder`.
- Comments (`notes`) → appended to description under a `---` separator,
  attachment comments become their file name/URL text (files not copied).
- Not imported: reminders, filters, collaborators/assignees, project comments,
  shared-project ownership, attachments' bytes.

## UI

- Settings → new "Import" section: Connect Todoist → (browser hand-off) →
  choose projects + categories (all on by default except completed) → Import →
  progress → summary with warnings. Re-run shows "N already imported, will be skipped".
- First-run prompt: after **sign-up** (not sign-in), show a one-time dialog
  "Bring your tasks from Todoist?" with Import (→ Settings import) and Skip.
  Persisted as `userSettings.importPromptSeenAt` so it shows once per account,
  across devices.

## Out of scope

Continuous sync, exporting to Todoist, other providers (structure the mapping
table with a `provider` column so they can follow), legacy web UI.
