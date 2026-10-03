# Keyboard support final review

Fixed point: `b907b7ac3019d50dcdcbefc2b7a896a118e78674`. Reviewed integration: `1f20d99`. One fix implementer branch: `codex/keyboard-review-fixes`. Canonical scope: [spec](spec.md). Browser evidence: [/private/tmp/todalo-keyboard-browser-verification.md](/private/tmp/todalo-keyboard-browser-verification.md).

## Summary counts

| Axis | Findings | Implemented resolutions | Remaining code findings |
| --- | --- | --- | --- |
| Standards | 3 (1 documented guideline, 2 heuristics) | 3 | 0 |
| Spec | 4 | 4 | 0 |

Additional browser findings addressed: organization submit buttons (also in Spec report), help typography/reference inset and rounding, TodayPage React child key warning, stale deadline overwrite after immediate reopen, and default-body-focus project file paste. Final live browser confirmation remains with the lead/ticket 07; automated simulations are not OS-native clipboard verification.

An additional confirmed Quick Add arrow propagation failure is fixed: scoped description/actions/deadline commands use an opt-in capture-phase registration, before dialog internals stop arrow bubbling. Save and dismissal retain bubble handling so native popup behavior survives. Capture and bubble command sequences have independent dispatcher state and both reset on focus/composition/context changes. [Dispatch regression](../../apps/web/lib/keyboard.test.ts) covers ArrowDown and Shift+ArrowDown with typing/modal eligibility; lead's browser event trace provides the red reproduction.

## Standards report

# Standards review

Fixed point: `b907b7ac3019d50dcdcbefc2b7a896a118e78674`; reviewed integration `1f20d99` with `git diff b907b7ac3019d50dcdcbefc2b7a896a118e78674...HEAD`. Sources: repository `AGENTS.md` and installed Next.js 16.2.10 guides. Tooling-enforced and baseline lint findings excluded. Browser notes read for context; their functional findings belong to the separate Spec pass.

## Documented guideline breach

- **[P2] Limit new server-action responses to UI fields.** `apps/web/app/(app)/tasks/metadata-actions.ts:16–20` selects full label/filter records and returns `labels: userLabels` plus `filters.map(filter => ({ ...filter, ... }))`. `apps/web/app/(app)/projects/organization-actions.ts:16–18` similarly returns the full owned project/section records. Installed `node_modules/next/dist/docs/01-app/02-guides/data-security.md`, “Controlling return values,” says: “Only return what the UI needs, not raw database records.” These responses unnecessarily serialize `userId`, creation timestamps, and other internal columns. Select explicit label `{id,name,color}`, filter `{id,name,definition}`, project `{id,name}`, and section `{id,projectId,name}` DTOs. Existing ownership checks are present; this is data-minimization guidance, not evidence of cross-account disclosure.

## Heuristic judgments

- **[P2] Possible Duplicated Code / Feature Envy: task focus ownership.** `task-keyboard-provider.tsx:59–63` and `task-metadata-actions.tsx:20–24` independently perform `document.activeElement...closest('[data-task-id]')`, collection containment, and `tasks.find(...)`. The metadata component additionally derives selection targets by inspecting provider state. Move active-task/target resolution into the task keyboard context and reuse it, keeping deadline/calendar/project precedence consistent when focus behavior changes.

- **[P3] Possible Duplicated Code: relational test boundary.** `organization-actions.test.ts` and `metadata-actions.test.ts` each define a Drizzle SQL predicate evaluator and `function builder(...)` inside `vi.mock("@todalo/db", ...)`. Their insertion/default behavior already differs. Extract a shared database-boundary fixture supporting both suites so ownership regressions are tested against one consistent persistence model.

Total: one documented guideline breach and two heuristic findings. No additional hard repository-standard violations identified.


### Standards resolution pointers

- Minimal UI DTOs: [metadata actions](../../apps/web/app/(app)/tasks/metadata-actions.ts) explicitly select label/filter/editor fields; [organization actions](../../apps/web/app/(app)/projects/organization-actions.ts) return only project/section identity and labels. Public action tests assert exact response fields and account isolation.
- Central task/selection ownership: [TaskFocusController](../../apps/web/lib/task-keyboard.ts) resolves actual active task or explicitly selected toolbar context. [TaskKeyboardProvider](../../apps/web/components/tasks/task-keyboard-provider.tsx) owns DOM interpretation and exposes that resolver to metadata/organization consumers. Remembered focus cannot target an unrelated control.
- Shared relational boundary: [fixture](../../apps/web/lib/testing/relational-boundary.ts) supplies identical SQL predicates, insertion defaults and batch behavior for both organization and metadata action suites.

## Spec report

# Spec review

Reviewed integration `1f20d994e135619dc588d9b37d3ae4a8bfaea942` against `b907b7ac3019d50dcdcbefc2b7a896a118e78674`, canonical specification, full research/coverage and browser verification notes. No material scope creep found.

- **P1 — New organization forms cannot submit through their buttons.** Spec: “A stage is complete only when its commands, customization, hints, and relevant keyboard flows pass the checks below.” `apps/web/components/organization/project-directory.tsx:14`, `project-view.tsx:44` and `:45`, and `organization-task-actions.tsx:59` omit `type="submit"`. Base UI defaults these buttons to `button`. Browser verification already confirms Create project/Create section/Save project name clicks do nothing. Move has only selects and a non-submitting button, so Enter/Space on its action cannot execute the requested move. Set explicit submit types and verify keyboard/button submission.

- **P2 — Adding an alternate binding silently replaces platform defaults.** Spec: “Each action can have multiple bindings”; “Resolve bindings in this order: supported platform defaults, portable account overrides, then explicit platform overrides.” `apps/web/components/keyboard/shortcut-settings.tsx:47–55` seeds portable edits from `command.defaults`, ignoring current platform defaults. On Mac, adding a Delete binding replaces active Command+Backspace with Shift+Delete plus the new binding; the displayed replacement controls also identify the wrong existing binding. Preserve current effective platform bindings when adding/replacing and make portable/platform consequences explicit.

- **P2 — Organization commands target stale task focus.** Spec: “Commands target the visible view and focused/selected task.” `apps/web/components/organization/organization-task-actions.tsx:33–50` uses remembered `keyboard.focusedId`, whereas completion/date/metadata handlers check actual active task focus. After focusing a row then tabbing to an unselected collection control, V, Shift+G or Control+[ still operate on the earlier row. Gate these actions on actual focused row or explicit selection and decline otherwise.

- **P2 — Coverage matrix contradicts shipped availability.** Spec: “A command coverage matrix must track every researched action as available, planned for a stage, excluded, browser-native, or disputed.” `docs/research/keyboard-command-coverage.md:64` and `:72–78` still classify layout, Upcoming/calendar navigation and file paste as planned, although registry and handlers ship them. Update those rows and the native-paste/custom-clipboard limitation note.


### Spec resolution pointers

- Explicit submit buttons: project directory, section creation, project rename, and move forms. Move targets are captured when opening so modal focus does not invalidate the submitted selection. Existing browser reproductions provide the red condition; lead verifies click/Enter/Space after integration.
- Platform-preserving edits: [keyboard edit seam](../../apps/web/lib/keyboard-edit.ts) applies add/replace/remove/disable/reset to each platform's current effective set. Mac Command+Backspace and Windows Shift+Delete survive an added portable alternate; missing alternate positions append without sparse bindings. Settings display the effective set and explain all-platform/profile consequences. [Regression tests](../../apps/web/lib/keyboard-edit.test.ts) cover Mac/Windows differences and platform-only edits.
- Organization stale focus: all commands use the shared task resolver and decline on unrelated controls. Selected toolbar context remains valid. Toggle nested tasks/sections declines while project sorting is active via the visible view/provider contract.
- Coverage: [matrix](../../docs/research/keyboard-command-coverage.md) has no stale planned personal-feature rows; layout, Upcoming/calendar and file-paste actions are available. Disputed Windows calendar Option alternative remains explicit. Native/default paste and custom Clipboard API limitations are documented.

## Browser finding resolutions

- Help/settings typography: corrected circular theme font alias to Geist Sans with system sans fallback; explicitly use theme sans. Help has a restrained desktop inset/rounded panel, full-width mobile, a fixed header and scrolling body. Popup/backdrop honor reduced motion. Original [reference](../../docs/research/assets/keyboard-shortcuts-help-reference-2026-10-03.png) retained.
- React key warning: TodayPage passes keyed view slots; ViewSwitcher renders a single keyed Fragment instead of mixing server-supplied React nodes into conditional sibling children.
- Fresh task edits: editor and metadata picker load authenticated minimal current task fields before editing. Save declines until current data is loaded, preventing old props from clearing a freshly saved deadline. Public action regression verifies immediate fresh read and subsequent description update preserves deadline, and rejects a foreign task.
- Project file paste: document-level native paste registration accepts active project elements or default body focus, excludes outside/sidebar targets, and retains editor/modal/composition checks. Custom binding eligibility uses the same boundary. [Paste tests](../../apps/web/lib/project-file-paste.test.ts) verify body/project/sidebar eligibility; native OS clipboard behavior remains a manual check.

## Verification and limits

- 24 test files / 270 tests pass; full web and database typechecks pass; changed review files have no new lint errors/warnings; task-composer retains its two baseline effect findings. Diff check passes.
- Full web lint retains exactly three pre-existing `react-hooks/set-state-in-effect` errors: `components/tasks/task-composer.tsx:77`, `:622`, and `hooks/use-mobile.ts:14`. Composer/Ramble state behavior preserved.
- Isolated webpack production build passes compilation, TypeScript, static generation and route tracing with public Google Font access. Default Turbopack cannot resolve the cached dependency symlinks outside this isolated worktree; no production config workaround is committed.
- Lead applied migrations 0006–0009 and verified file task/attachment creation/download. No new migration added by review fixes. Real Mac/Windows OS clipboard capture, browser-specific reserved key behavior and non-US layout/manual limits remain explicitly recorded in browser notes.
