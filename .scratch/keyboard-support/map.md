# Keyboard support implementation

## Notes

Integration branch: `codex/keyboard-support`. Full approved scope: [spec](spec.md).

Dependency graph: 01 → {02, 03} → {04, 05, 06} → 07. Claims and resolutions follow [tracker conventions](../../docs/agents/issue-tracker.md).

## Decisions-so-far

- Implementation request supersedes old pending-confirmation language and authorizes full scope and ticket preparation.
- Preserve the original design, binding inventory and visual reference; track disputed bindings explicitly.
- Local tracker conventions are open → claimed → resolved; triage-labels.md is absent.
- Baseline at `b907b7ac3019d50dcdcbefc2b7a896a118e78674`: 13 test files / 219 tests and web typecheck pass. Existing lint failures are `react-hooks/set-state-in-effect` in `task-composer.tsx:75,598` and `hooks/use-mobile.ts:14`. Production build is blocked fetching Google Geist/Geist Mono fonts under restricted network; distinguish these baseline/environment failures from new implementation regressions.
- [01 resolved](issues/01-shortcut-foundation.md#answer): foundation commit `60f121c`, integration merge `a585293`; 228 tests and web typecheck pass. Preferences migration is committed, not live-executed. [Command coverage](../../docs/research/keyboard-command-coverage.md) records remaining command availability; tickets 02 and 03 are claimed for the next frontier.

## Fog

- Real Mac/Windows/browser-native and non-US layout capture require honest verification limits.
