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
- [Foundation browser verification](/private/tmp/todalo-keyboard-browser-verification.md): migration 0006 successfully applied to configured development database; help focus, settings persistence/remap, disabled visible entry, mobile/light/dark and validation flows checked. Typography/rounding refinement remains in final review.
- [02 resolved](issues/02-task-keyboard-actions.md#answer): focused task/editor implementation `5afc7db`, merge `0cc26a7`; 232 tests and web typecheck pass. Ticket 03 remains claimed; preserve task null/bulk/placement changes when integrating its organization extension.
- [Task browser verification](/private/tmp/todalo-keyboard-browser-verification.md): J/K navigation, X selection, comma details, Enter and Meta+E editor behavior, typing suppression, and E completion with nearest-focus restoration checked by lead.
- [03 resolved](issues/03-personal-organization.md#answer): organization implementation `9ca7cf6`, integration merge `2f07788`; 242 tests and web/database typechecks pass. Additive sections migration 0007 is not yet live-executed. Tickets 04, 05 and 06 are claimed for the next frontier.
- Migration 0007 has now been applied to the configured development database by the lead; [browser verification notes](/private/tmp/todalo-keyboard-browser-verification.md) track live navigation/organization checks.
- [05 resolved](issues/05-view-calendar-parity.md#answer): calendar/layout implementation `7c368ce` integrated; 18 test files / 246 tests and full web typecheck pass. Effective layout/navigation bindings, actual focused task precedence, project task dates, and Google event overlays are implemented. Windows calendar Option alternative remains disputed; Today retains its day/overdue schedule. Interactive checks continue in ticket 07.

## Fog

- Real Mac/Windows/browser-native and non-US layout capture require honest verification limits.
