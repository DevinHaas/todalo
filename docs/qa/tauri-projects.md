# Projects — ticket 8 evidence

Recorded 15 October 2026 against the isolated in-memory QA API
(`apps/client/scripts/auth-smoke-server.ts` with `QA_CLIENT_ORIGIN=http://localhost:5183`,
port 3039, fixture projects `Work`/`Errands` plus a second user's `qa-other`). No
production data; the user's port-3001 API was not used. Screenshots are in
`docs/qa/tauri-projects/`.

## Browser walkthrough (Chromium via Playwright, Vite dev on 5183)

| Step | Viewport | Result |
| --- | --- | --- |
| Open `/projects` signed out, sign in | 1440 × 1000 | Route kept through sign-in; directory lists `Errands`, `Work` (name order); sidebar Projects active, Today badge 2 (`projects-desktop.png`). |
| Create `"  Garden  "` | 1440 × 1000 | Saved as `Garden`, list re-sorted, input cleared. |
| Open `Work` | 1440 × 1000 | Three member tasks with legacy row pills and `# Work` project pill, `3 tasks`, inert Add section / Add task (`project-desktop.png`). |
| Rename to `Work renamed` | 1440 × 1000 | Title and every row pill updated after refetch; menu closes. |
| Delete | 1440 × 1000 | In-page confirmation with legacy copy (`delete-confirm-desktop.png`); confirm returns to `/projects` without `Work`. |
| Today after delete | 1440 × 1000 | Former member tasks still present with `Inbox` pills; Today count and badge unchanged at 2; `GET /api/v1/tasks/future` → `projectId: null`. |
| API from the signed-in page | — | `qa-other` (second user) and `nope` both `404` with identical bodies for GET, PATCH and DELETE; blank name `400 INVALID_INPUT`; `text/plain` POST `400`. |
| `/projects/qa-other` | 390 × 844 | "Project not found" (`foreign-mobile.png`). |
| Directory, empty project with menu open | 390 × 844 | No horizontal overflow (`scrollWidth` 390); inputs/buttons 44px (`projects-mobile.png`, `project-mobile.png`). |
| QA API stopped, open Projects | 390 × 844 | Error text and Try again (`error-mobile.png`). |

## Automated coverage

- `packages/server/src/projects.test.ts`: owner-only list/open, foreign = missing,
  create for the session user, rename keeps color, foreign rename/delete refused,
  DTO allow-list and legacy name validation (trim, 1–200).
- `apps/api/src/project-routes.test.ts`: 401 envelope on all five routes, session-only
  user (`?userId=` and body `userId` ignored), member tasks only, identical 404 for
  foreign and missing IDs on read/rename/delete, 400 validation, delete keeps tasks
  (projectId → null), cookie writes need an allowed Origin (403 otherwise), bearer
  writes ignore cookies.
- `apps/client/src/projects.test.ts`: transport methods/paths/encoding, 404 → null/false,
  error mapping (401/400/403/500/offline), user-scoped keys, cache invalidation per
  mutation, directory and project loading/error/empty/populated/not-found states,
  Today rows labelled with their project or Inbox.
- `src-tauri/src/projects.rs`: names trimmed and bounded before any request; IDs reuse
  the tested `reads::valid_id`.
- On a clean checkout of the commit (no other agents' changes): root `bun run test`,
  `bun run typecheck`, `bun run build`, `cargo fmt --check`, `cargo test --locked` passed;
  `bun run lint` has only the 3 known apps/web errors.

## Not verified

- iOS Simulator: a debug `aarch64-sim` build with these commands built and launched
  (`TAURI_TODALO_API_BASE_URL=http://127.0.0.1:3039`), but another agent was driving
  the shared simulator and force-quit the app before sign-in, so native project
  IPC was not exercised end to end. The Mac app shell and a physical iPhone were not run.
- Legacy Next screens were not re-run in a browser; their actions now call the shared
  `@todalo/server/projects` functions (same queries) and `bun run build` passed.
- Database `ON DELETE` behaviour (tasks `SET NULL`, sections `CASCADE`) comes from the
  existing schema; tests emulate it rather than running Postgres.

## Intentional differences from legacy

Sort selector, sections, board/calendar views, project file paste and keyboard
commands are not migrated (tickets 9, 13, 16, 17, 18). Delete confirmation is in-page
rather than `window.confirm`, and deletion returns to Projects instead of Inbox (ticket 12).
Load failures reuse the shared "Your tasks could not be loaded" copy.
