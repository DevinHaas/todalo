# Today baseline evidence — ticket 1

Recorded 4 October 2026. Screenshots are actual Chromium renders of the existing
Today components and app layout composition, with deterministic fixture data.
They are **fixture-based visual evidence**, not an authenticated account walkthrough,
an iPhone/WKWebView test, or a migration comparison. No database data was seeded.

## Captures

| File | Viewport | Evidence |
| --- | --- | --- |
| `tauri-baseline/today-desktop.png` | 1440 × 1000, DPR 1 | Full sidebar/account/navigation, original toolbar, Today count, overdue row, calendar event, today's task and composer |
| `tauri-baseline/today-mobile.png` | 390 × 844, DPR 1 | Existing responsive toolbar/sidebar trigger, wrapped task rows and composer; no horizontal document overflow |

Chromium 154.0.8037.93; light scheme; reduced motion; `en-GB`; browser and Next
server timezone `Europe/Zurich`; browser clock fixed at
`2026-10-04T10:00:00.000Z`; capture waits for the Today heading and loaded fonts.
The finalized runner was rerun successfully with no page errors, and temporary
route cleanup was verified on the host. The images were visually inspected. Both
captures display two open task rows;
two fresh-context repetitions had identical mobile pixels and a single desktop
pixel difference at the calendar event marker (291, 285), attributable to raster
rendering. Do not demand byte identity across browser/OS graphics backends.
future, undated and completed fixture tasks remain supplied to the real views.
The runner hides the Next development overlay and moves the pointer out of the
controls so development chrome and hover state do not affect parity. The capture path is `/tauri-baseline`,
so the sidebar has no active Today-route highlight. These harness differences must
be excluded from eventual production visual comparison.

The harness uses `AppSidebar`, `SidebarProvider/Inset/Trigger`, the unchanged layout
spacing and display controls, `ViewSwitcher`, `TodayView`, `TodayScheduleView`,
keyboard/smart-date/Ramble providers, actual Tailwind CSS, root layout and Geist
fonts. It omits live calendar SSE and authenticated navigation data loading.
Fixture account/task IDs are artificial. Capture automation performs no mutations.

## Reproduction

1. Install workspace dependencies (`bun install --frozen-lockfile --ignore-scripts`).
2. Run `bash docs/qa/tauri-baseline-serve.sh`. This creates a temporary fixture route
   and starts Next at `http://127.0.0.1:3101`; stop with Ctrl-C to remove the route.
   Do not run a Next build concurrently against the same `.next` directory.
3. Invoke the Playwright browser tool's `browser_run_code_unsafe` with `filename`
   pointing to the absolute path of `docs/qa/tauri-baseline-capture.js`. It writes
   screenshots to `/tmp/todalo-tauri-baseline` for review and returns capture evidence.
   If the tool restricts file access to another checkout, pass this file's contents
   as its `code` parameter instead of `filename`.
4. Review captures against the committed PNGs before replacing them. Keep browser,
   locale, timezone, font loading, clock, view settings and dimensions matched.

The fixture source is `tauri-baseline-fixture.ts`; the temporary route source is
`tauri-baseline-page.tsx`. Neither is a production application route. The server's
date is still the real process clock; the fixture browser's date is explicitly
fixed. The harness renders its content only after hydration, so process time cannot
influence the fixture's date headings. The runner also waits for the exact visible
heading `4 Oct · Today · Sunday` before accepting a screenshot.

## Test baseline and extraction verification

- Initial symlink-only worktree setup: full test run had 8 unresolved-package
  failures (`@todalo/ramble`), 19 passing files / 129 passing tests. This was an
  environment issue, not a product regression.
- After isolated frozen-lockfile install, before implementation: **27 files,
  281 tests passed**. Root workspace typecheck passed all five original workspaces;
  API build passed (9 modules, 38.15 KB). No pre-existing product test failures remain.
- TDD red: `packages/server/src/today.test.ts` failed because the reusable Today
  module did not exist. Green: five public query regressions pass with
  `TZ=Europe/Zurich bun run test packages/server/src/today.test.ts`.
- Cases cover foreign user/task-label isolation, empty account, overdue and
  local-day midnight/end boundaries, future/completed/undated tasks retained for
  layout switching, both Zurich DST transitions, and optional project scoping.
- `bun run --filter @todalo/server typecheck` and legacy web typecheck pass.
- Final full-suite/production-build integration evidence is owned by the parent
  migration run and recorded in its progress report.

The server query consumes an already authenticated user ID; auth wrappers retain
responsibility for resolving the session. It does not import Next headers, cache
or navigation. `getOwnedTask` and all mutations retain their legacy implementation.
Date semantics remain the server's local calendar day, including later-today
tasks, rather than introducing a new timezone or UTC date cutoff. Client list
filtering is unchanged. The original DB sort-order clause remains in the shared read.

Ownership tests use the existing relational database boundary, not a real
PostgreSQL server. They execute real Drizzle predicates; its helper does not model
database ordering. Real database/integration transport and physical Apple evidence
remain owned by later feature/gate tickets. See `tauri-baseline-inventory.md` for
all route/operation ownership across tickets 1–28.
