# Keyboard support verification

Integration branch: `codex/keyboard-support`. Baseline: `b907b7ac3019d50dcdcbefc2b7a896a118e78674`.

## Automated checks

Final review-fix checks and integration rerun are recorded in [implementation report](implementation-report.md). The initial combined implementation passed 261 tests across 23 files and both web/database typechecks. Regression coverage includes dispatch precedence, editor/modal suppression, produced characters, platform bindings, conflicts and sequences, account ownership and persistence, bulk operations, organization constraints, metadata, and protected attachments.

Baseline whole-app lint already fails three React set-state-in-effect rules: two in `task-composer.tsx` and one in `use-mobile.ts`. New and changed code receives focused lint checks. The initial production build could not fetch Google fonts under restricted network. The final isolated build uses supported webpack because cached dependencies linked outside the worktree are inaccessible to Turbopack; report its actual result separately.

## Browser checks

Authenticated Chromium checks used the repository's development test account at `http://localhost:3000`. Fixtures created during this verification are identified below and removed after the final pass. Other existing account data is preserved.

- Help: `?` opens the modal, focus starts at Close, Tab stays inside, Escape closes, and focus returns to its opener. Keyboard entry remains available through Settings when the help shortcut is disabled. Background actions stay suppressed while typing and while the modal is open.
- Preferences: recorded an alternate help binding, verified draft isolation, saved it, checked help and dispatch, and reloaded to confirm persistence. Restored defaults after testing. Capture-task conflicts block Save and suggest an alternative; browser-reserved Control+L is rejected with a reason.
- Appearance: desktop light/dark rendering and a 390×844 viewport checked. Mobile help fills available width without horizontal overflow and keeps Close reachable. Final review refinements and reduced-motion/list-scroll assertions are recorded below.
- Task focus: J/K navigate visible rows, X selects, comma focuses the selection toolbar, Enter opens details, and Escape returns to the row. Meta+E opens the inline editor. A creates at the bottom; Enter creates the owned fixture and starts the next composition; help is suppressed while typing. E completes the fixture and moves focus to the nearest remaining row.
- Organization: Inbox, Home, Projects, project detail, Search, and Quick Find routes open via their registered shortcuts. S creates a section with Enter. W opens project actions; G then slash opens section navigation. Actual mouse form submission and stale-focus protection are checked again after review fixes.
- Metadata: keyboard priority 1 and label selection persist; a saved filter combining project, label, and priority finds the fixture. D saves deadline 2026-10-10; Shift+D clears it, confirmed after reload. Description saves through Meta+Enter. The owned canonical task route opens the task details.
- Layout/calendar: Shift+V cycles list → board → calendar → list. Project calendar Shift+Right advances the visible week, and T returns to today. Upcoming week/today keys dispatch without a page error; exact Upcoming scroll position and live Google-event data were not asserted.
- Attachments: a synthetic clipboard File pasted in the project collection creates a filename task with a stored attachment. Its protected download returns HTTP 200 with the exact test content and safe attachment disposition. Default project-body paste is checked after the review fix.
- Quick Add: Q opens capture; `{` reveals and focuses Deadline. ArrowDown and Shift+ArrowDown initially failed because a dialog handler stopped propagation; the review-fix regression and final browser results are recorded below.

## Final review-fix browser pass

Review fixes `c9913a5` were integrated as `6db97f6`; 24 files / 270 tests and web/database typechecks pass after merging.

- Q → ArrowDown now reveals and focuses Description. After returning focus to Task name, Shift+ArrowDown reveals additional fields; `{` focuses Deadline. Escape dismisses capture.
- Mouse submission creates the extra project and section. The Move task button moves the fixture to Inbox and back to its project, confirmed after navigation.
- All-platform Add binding preserves macOS Meta+Backspace and Windows Shift+Delete while adding Alt+Shift+Z to each. Saved and inspected both profiles, then restored defaults.
- With Project menu focused after a task row, V opens no task dialog; Shift+G and Control+[ do not act on remembered row focus.
- A synthetic File pasted at the body of the newly opened empty project creates `Keyboard-QA-body-paste.txt` with a stored attachment.
- Deadline changed to October 11, followed immediately by a description save. Reload confirms October 11 remains saved. Loading fields initially flashed old data; the follow-up fix hides them until the owned task arrives.
- Help fits at desktop/mobile sizes: desktop width 512 with right inset 16 and radius 14; mobile width 390 with no horizontal overflow and Close top 16. The list scrolls through its final Calendar group, and Tab remains inside. Reduced-motion media matches and produces `transition-property: none` and `transform: none`.
- Follow-up fixes `39fb0ba` were integrated as `61acdda`; 25 files / 272 tests and both typechecks pass. Project and direct task routes now reload with no browser console errors. Changing deadline to October 12, reopening immediately, and saving a description shows October 12 both immediately and after reload. Inputs appear only after the fresh owned task arrives.
- Help now computes Geist with system sans fallback. Final light/dark screenshots were visually inspected against the supplied reference; keycaps remain aligned, grouping and spacing are restrained, and contrast follows the theme. Final isolated webpack build also passed after the date/font/loading changes.

## Verification limits

Mac and Windows modifier resolution and non-US produced-character behavior are exercised through automated events. This is not a physical Windows or non-US keyboard test. The browser/OS may intercept combinations before the page receives them; accepted remaps do not guarantee universal native capture. Synthetic clipboard files verify the app's paste/storage/download path, not a physical OS clipboard. Native clipboard permissions, actual reserved browser commands, real Windows/Linux browsers, and live Google-calendar credentials require those environments. These limits remain explicit in [coverage](../../docs/research/keyboard-command-coverage.md) and [attachment storage](../../docs/agents/attachment-storage.md).

## Development fixtures and cleanup

- Project `Keyboard QA project`: `f7cabb05-d66a-44c1-baab-f63b32464474` and its owned `Keyboard QA section`.
- Label `Keyboard QA label`: `0e92f209-6edf-480f-b96a-768152cb89e1`.
- Saved filter `Keyboard QA filter`: `13d9a341-bc5e-4911-8b5a-ee878a217fb0`.
- Pasted task `Keyboard-QA-attachment.txt`: `4242f854-ee8c-459d-a00a-223a1138bd9e` and attachment `07764fac-10af-4d73-91df-1bb7b9ab48e7`.
- Completed task created for keyboard testing: `Keyboard QA fixture`.
- Extra project created by clicking submit: `4730b224-7fcc-4275-8618-31efb7892d35` (`Keyboard QA submit project`).
- Extra section `Keyboard QA submit section` belongs to the first fixture project.
- Body-paste task: `3d81bcf2-e489-4114-beea-ffd04bd6c66d` (`Keyboard-QA-body-paste.txt`), in the extra project.

Cleanup completed with owner-scoped exact IDs and an unexpected-project-task guard: removed 3 fixture tasks, 1 saved filter, 1 label, and 2 projects. Project sections and task attachments were removed through their foreign-key cascades. Other existing account data was preserved. Shortcut preferences were restored to defaults; temporary cleanup source was removed.

The final production preview at localhost:3017 also passed authenticated project/help, direct task/deadline, and Today checks with zero console errors or warnings. The temporary server is stopped after verification; the original development server remains available.

## Database migrations

Additive migrations 0006–0009 were reviewed and applied successfully to the configured development database: account keyboard preferences; sections/task section references; priority, deadline, labels and filters; attachments. Deployment migrations remain in the normal journal. No migration removes existing data.
