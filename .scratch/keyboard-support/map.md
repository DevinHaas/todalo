# Keyboard support implementation

## Notes

Integration branch: `codex/keyboard-support`. Full approved scope: [spec](spec.md).

Dependency graph: 01 → {02, 03} → {04, 05, 06} → 07. Claims and resolutions follow [tracker conventions](../../docs/agents/issue-tracker.md).

## Decisions-so-far

- Implementation request supersedes old pending-confirmation language and authorizes full scope and ticket preparation.
- Preserve the original design, binding inventory and visual reference; track disputed bindings explicitly.
- Local tracker conventions are open → claimed → resolved; triage-labels.md is absent.
- Baseline at `b907b7ac3019d50dcdcbefc2b7a896a118e78674`: 13 test files / 219 tests and web typecheck pass. Existing lint failures are `react-hooks/set-state-in-effect` in `task-composer.tsx:75,598` and `hooks/use-mobile.ts:14`. Production build is blocked fetching Google Geist/Geist Mono fonts under restricted network; distinguish these baseline/environment failures from new implementation regressions.
- [01 resolved](issues/01-shortcut-foundation.md#answer): foundation commit `60f121c`, integration merge `a585293`; 228 tests and web typecheck pass. Preferences migration was subsequently executed successfully. [Command coverage](../../docs/research/keyboard-command-coverage.md) records remaining command availability.
- [Foundation browser verification](verification.md): migration 0006 successfully applied; help focus, saved remaps, disabled visible entry, mobile/light/dark and validation flows checked. Final typography/rounding refinements are verified.
- [02 resolved](issues/02-task-keyboard-actions.md#answer): focused task/editor implementation `5afc7db`, merge `0cc26a7`; 232 tests and web typecheck pass. Ticket 03 remains claimed; preserve task null/bulk/placement changes when integrating its organization extension.
- [Task browser verification](verification.md): J/K navigation, X selection, comma toolbar focus, Enter and Meta+E editor behavior, typing suppression, and E completion with nearest-focus restoration checked by lead.
- [03 resolved](issues/03-personal-organization.md#answer): organization implementation `9ca7cf6`, integration merge `2f07788`; 242 tests and web/database typechecks pass. Additive sections migration 0007 was subsequently live-applied by the lead.
- Migration 0007 applied successfully; [browser verification](verification.md) records navigation/organization checks, including repaired mouse form submission.
- [05 resolved](issues/05-view-calendar-parity.md#answer): calendar/layout implementation `7c368ce` integrated; 18 test files / 246 tests and full web typecheck pass. Effective layout/navigation bindings, actual focused task precedence, project task dates, and Google event overlays are implemented. Windows calendar Option alternative remains disputed; Today retains its day/overdue schedule. Interactive checks continue in ticket 07.
- [06 resolved](issues/06-file-paste-tasks.md#answer): attachments branch `befca27`, integration merge `ac4d48d`; 21 test files / 256 tests, web/database typechecks, and attachment lint pass. PostgreSQL-backed project paste tasks, authenticated attachment access, effective shortcut behavior, and visible clipboard failures are implemented. [Storage/deployment limits](../../docs/agents/attachment-storage.md) document capacity and browser requirements. Migrations 0008/0009 were subsequently applied by the lead.
- [04 resolved](issues/04-task-metadata-filters.md#answer): full metadata branch `aa5bcb3`, integration merge `28a7316`; combined 23 test files / 261 tests and web/database typechecks pass. Metadata, labels, saved filters, owned task URLs and bulk/Quick Add commands are implemented. Changed-file lint retains only the recorded baseline task-composer effect findings. Ticket 07 is claimed for final review and verification.
- All migrations 0006–0009 successfully executed. [Verification](verification.md) records protected attachment download, metadata/view checks, cleanup and platform limits.
- [07 resolved](issues/07-integration-verification.md#answer): review fixes `c9913a5` / `39fb0ba`, integration merges `6db97f6` / `61acdda`; final 25 files / 272 tests, web/database typechecks, focused lint and isolated webpack build pass. All Standards/Spec and browser findings fixed; production browser checks show no errors. Test fixtures removed and all implementer worktrees archived. [Implementation report](implementation-report.md) is the final handoff.

## Fog

- Physical Windows/non-US keyboard capture, native clipboard permissions and live calendar data remain documented [verification limits](verification.md#verification-limits).
