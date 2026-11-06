# Today and task detail — ticket 3 evidence

Recorded 15 October 2026 against the isolated in-memory QA API
(`apps/client/scripts/auth-smoke-server.ts`, port 3009, fixture tasks; no
production data, the user's port-3001 API untouched). Screenshots are in
`docs/qa/tauri-today/`.

## What was compared

| Capture | Client | Viewport | Baseline | Result |
| --- | --- | --- | --- | --- |
| `today-desktop.png` | Chromium (Playwright), Vite dev | 1440 × 1000 | `tauri-baseline/today-desktop.png` | Sidebar width (256px), item order/icons/spacing, header, `N tasks`, Overdue toggle, date heading, row pills and composer row match within ~2–4px vertically. |
| `today-mobile.png` | Chromium | 390 × 844 | `tauri-baseline/today-mobile.png` | Toolbar/trigger at same positions, title/rows wrap the same way, no horizontal overflow (`scrollWidth` 390). |
| `sidebar-mobile.png` | Chromium | 390 × 844 | legacy mobile sheet | 18rem drawer with backdrop; 44px touch rows (intentional). |
| `detail-desktop.png`, `detail-mobile.png` | Chromium | both | legacy `TaskDetailPage` | Title, completed flag, description, `Priority · Due · Deadline` line. |
| `foreign-mobile.png` | Chromium | 390 × 844 | — | `/tasks/other-private` (second user's task) shows "Task not found"; API returned the same 404 body as a missing ID. |
| `error-mobile.png` | Chromium | 390 × 844 | — | QA API stopped: error text + Try again. After restarting the API (sessions lost) Try again → 401 → session refresh → sign-in screen, URL `/today` kept. |
| `ios-today.png`, `ios-sidebar.png`, `ios-detail.png` | iOS Simulator, iPhone 17 Pro (iOS 26.0.1), debug `aarch64-sim` build with `TAURI_TODALO_API_BASE_URL=http://127.0.0.1:3009` | 402 × 874 pt | mobile baseline | Native `today` and `task` IPC commands returned data through Rust/Keychain bearer; toolbar sits below the Dynamic Island, sidebar footer above the home indicator. |

Fixture dates are relative to the service start (15 Oct), so headings differ from
the baseline's fixed 4 Oct clock. The baseline fixture has no deadline on the
today task; the QA fixture does, so that row wraps its pills on mobile. Fonts:
`document.fonts.check('16px "Geist Variable"')` was true in Chromium.

Intentional differences: 44px sidebar/trigger touch targets below 768px,
safe-area padding, active Today highlight (baseline harness route had none),
calendar events are not shown (calendar reads are ticket 16/20), and controls
without migrated backends (add task, Ramble, search, other nav, display, date
arrows, completion checkbox) are inert with `aria-disabled`.
`detail-desktop.png` predates a 4px sidebar spacing fix visible in `today-desktop.png`.

## Automated coverage

- `packages/server/src/today.test.ts`: `getOwnedTask` returns null for foreign and missing IDs.
- `apps/api/src/task-routes.test.ts`: 401 envelope, session-only user (a `userId`
  query parameter is ignored), ISO date DTO with no `userId`/calendar fields,
  identical 404 for foreign and missing tasks.
- `apps/client/src/tasks.test.ts`: overdue/today grouping in local time with
  subtasks, legacy date labels, user-scoped cache keys, transport error mapping,
  path-segment encoding, and loading/error/empty/populated/not-found render states.
- `src-tauri/src/reads.rs`: task IDs that could alter the request path are rejected.
- Root `bun run test` (334 tests), `bun run typecheck`, `bun run build` passed.

## Not verified

- Software keyboard: Today/detail have no text inputs yet (the composer is inert),
  so there is no keyboard layout to check on these screens. The simulator used a
  connected hardware keyboard, so the on-screen keyboard did not appear.
- Physical iPhone and the Mac app shell were not run for this ticket; the iOS
  build included other agents' in-progress, uncommitted changes in the shared worktree.
- Native cross-user read in the simulator (the browser and API tests cover the shared endpoint).

## Simulator findings

- The first build's sidebar backdrop did not close on tap: iOS WebKit only dispatches
  clicks to elements it treats as clickable. `cursor: pointer` on the backdrop fixed
  it in a rebuilt app (verified).
- A relaunch of the rebuilt app restored the Keychain session and loaded Today directly.
- Injected simulator taps were often ignored on the first attempt and accepted on the
  second, for buttons and links alike. Unexplained; recheck on a physical iPhone.
- Simulator text injection used a non-US hardware layout (`-` became `'`), so
  credentials were entered through the simulator pasteboard.
