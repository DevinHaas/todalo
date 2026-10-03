# Quick-add validation — 3 October 2026

Preview: http://localhost:3000/upcoming. The local development server is running, and the built-in browser is signed into the existing Test User account.

## Automated checks

- `npm test -- --reporter=dot`: 11 test files and 146 tests passed.
- `npx tsc --noEmit`: passed, including after the Upcoming change.
- ESLint passed for the Upcoming page, sidebar, standalone quick-add, parser, and sync reducer.
- Composer lint reports two existing `react-hooks/set-state-in-effect` errors: custom-repeat reseeding and controlled-composer reseeding. Both effects are present in HEAD before these refinements.
- `git diff --check`: passed.

## Browser coverage

Used the built-in browser's Playwright API with real UI entry, saving, reloading, and task completion. Some final entry-point checks used accessibility activation because the browser's own comment overlay intercepted pointer clicks.

Verified:

- Sidebar modal and Today inline composer open, reset on cancellation, and reject an empty title.
- Dates, single 12-hour times, 24-hour ranges, `until` ranges, attached durations, and detached durations are recognized.
- A time without an explicit date defaults to today. A lone duration and an invalid time remain plain text.
- Manual date selection rewrites the title, survives unrelated title edits, and permits parsing again when the date phrase changes.
- Manual end-time keyboard edits override a parsed range. Clearing the date clears both times.
- Rejecting a start-time phrase removes its dependent duration. Rejecting a range in standalone quick-add preserves its literal text and saves an all-day task.
- Repeat presets rewrite the title. Custom repeat accepts an interval, a completion-date anchor, and an end date; those choices survive reopening. Selecting an end date without choosing a date disables confirmation.
- Immediate submission strips recognized phrases and saves the task. Saved start/end times persist after reload and appear in the task editor.
- Today inline creation preserves its default date.
- Recognition settings disable both compose surfaces, persist after reload, and re-enable without a page reload. The original enabled setting was restored.
- Completing a task with `every 3 days` advances its due date from 3 October to 6 October.
- After the requested layout change, Upcoming has no standalone quick-add field or standalone Add button. Sidebar quick-add and each day's Add task remain. Tomorrow's entry seeds tomorrow and retains that date during plain title edits.
- The standalone field is also absent at a 390 × 844 viewport. Temporary viewport overrides were reset.

The standalone quick-add save/settings checks were performed before removing that entry from Upcoming at the user's request. That component is no longer mounted by the Upcoming page.

## Changes made during validation

1. Removed the standalone quick-add field and its import from `app/(app)/upcoming/page.tsx`, retaining day-specific entries and the sidebar entry.
2. Made the composer's date/repeat picker scroll within the viewport. Previously Custom repeat was below the bottom of a 720-pixel-high browser and could not be clicked; opening the dialog succeeded after the fix.

## Remaining findings

### Custom recurrence is mislabeled in the task editor

Create `QA repeat today every 3 days`, then open the saved task. The Repeat selector displays `none`, although completing the task correctly advances it by three days. `recurrenceOptionValue` in `components/tasks/task-edit-dialog.tsx` only maps daily, weekly, and monthly presets; other intervals fall back to `none`.

### Resolved: hour-only 12-hour ranges were only partially recognized

Before the fix, entering `QA range tomorrow at 4pm-5pm` recognized tomorrow and the 16:00 start, but left `-5pm` as title text and did not derive an end time. The range grammar required a colon/minutes on its first endpoint. The tested `19:30 - 20:00` and `19:30 until 20:00` forms worked.

This finding was resolved in the browser-comment follow-up below.

## Limits and test records

This was a local browser walkthrough plus the automated unit suite, not a production deployment or cross-browser matrix. Native IME composition and Google Calendar synchronization were not exercised. One development hot-reload warning appeared during live edits; no application error-level browser logs were captured for localhost:3000.

Five tasks created by the initial validation remain in the existing test account: QA saved range, QA inline plain, QA quick duration, QA rejected range 19:30 - 20:00, and QA repeat. QA repeat is now due on 6 October after its completion check. Existing tasks were preserved. The validated refinements are included in the quick-add commit; no push or deployment was requested.

## Browser-comment follow-up — 3 October 2026

A new subagent implemented the three requested comment fixes in the sidebar and parser. The collapsed toggle, account menu, and plus button now share a 32-pixel column; browser measurements put all three centers at x=24, matching the navigation column. The expanded avatar also remains centered at x=24, matching the navigation icons.

The parser now consumes `from` with a time range and recognizes hour-only am/pm endpoints. Added 27 parser regression cases covering full-phrase title stripping, offsets, rejection, normalization, mixed formats, and invalid boundaries.

Root-only validation passed: `npx vitest run --exclude '.claude/**'` reported 84 tests (61 parser, 16 synchronization, 7 recurrence). Type checking, targeted lint, and whitespace checks passed. The earlier 146-test discovery included tests in nested worktrees; the root-only count avoids counting those unrelated checkouts.

Confirmed these six phrases in the built-in browser, including whole-phrase highlighting and the correct date/time badge:

| Phrase | Start–end |
| --- | --- |
| `4pm to 5pm` | 16:00–17:00 |
| `from 4pm to 5pm` | 16:00–17:00 |
| `4am to 6pm` | 04:00–18:00 |
| `from 16:00 to 17:00` | 16:00–17:00 |
| `at 4pm-5pm` | 16:00–17:00 |
| `FROM 4:15PM UNTIL 5:45PM` | 16:15–17:45 |

Saving `QA browser comments from 4pm to 5pm` produced the title `QA browser comments`; opening the saved task confirmed 16:00 and 17:00. That additional test record remains in the test account.

The custom-recurrence editor finding and preexisting composer lint findings remain outside these three requested fixes.

## Individual-time follow-up — 3 October 2026

Single am/pm times now work without `at`, an end time, or a duration: `4pm`, `4am`, `4:30pm`, uppercase/spaced variants, noon, and midnight. Existing numeric clocks such as `16:00` still work, and `at 4` / `at 16` recognize an explicit hour using 24-hour notation. Ordinary numbers remain title text; clarification about recognizing unadorned hours was optional and the default is to require a time format or `at`.

Added 29 regression cases covering both title positions, complete match offsets and title stripping, invalid/partial times, rejection, detached durations, and ordinary quantities. Root-only test suite: 113 tests passed. Type checking, parser/test lint, and whitespace checks passed.

Built-in browser checks confirmed `4pm`, `16:00`, `4:30pm`, `4am`, `at 16`, and `12pm` highlight and set the expected single start time. The user's existing `4pm I want to do this` draft was restored after testing and left unsaved.
