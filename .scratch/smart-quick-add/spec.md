Status: implemented

# Smart quick-add

## Problem Statement

Adding a task today means typing a title, then separately opening the date picker, setting a time range, and (after the task exists) opening the edit dialog to set recurrence. There's no way to just type "buy milk mon at 5pm" and have the date, time, and recurrence come out of the title itself — every structured field needs its own manual step.

## Solution

Recognize date, time, and recurrence language typed directly into a task's title — at creation time, in both `TaskQuickAdd` and `TaskComposer` — and turn it into structured fields (`dueDate`, start/end time, `recurrence`) instead of leaving it as plain title text. Recognition happens live as you type, highlighting the matched words inline; matched text is stripped from the title once accepted. The existing `DatePicker` popover grows a "Repeat" row so recurrence has a manual counterpart, including a Custom Repeat dialog for arbitrary intervals. Modeled directly on Todoist's Quick Add smart date recognition (see `docs/agents` reference research from https://www.todoist.com/help/articles/introduction-to-dates-and-time-q7VobO).

## User Stories

1. As a user typing a task title in `TaskQuickAdd`, I want to type "call mom tomorrow" and have "tomorrow" recognized and highlighted, so that the task is created with tomorrow's due date without opening a date picker.
2. As a user, I want the recognized phrase to disappear from the title once the task is saved, so that my task list doesn't show garbled leftover date words in titles.
3. As a user, I want to click a highlighted word to reject the match, so that a task genuinely named "Create monthly report" isn't forced to have a due date just because "monthly" looks like a date word.
4. As a user typing in `TaskComposer`, I want typed keywords to update the `DatePicker` pill and `TimeRangeInputs`, and vice versa, so that whichever I touch last (typing or the picker) is the one that wins.
5. As a user, I want picking a date via `DatePicker` to rewrite the recognized phrase in the title to match (e.g. "tomorrow" becomes "21.12"), so the title and the picker never visibly disagree.
6. As a user, I want to type "every day", "every week", "every month", or "every 3 days" and have it set the task's recurrence, so I don't have to open the edit dialog after creating the task just to make it repeat.
7. As a user, I want to type "at 4pm" and have it set the task's start time, so quick natural phrasing covers time as well as date.
8. As a user, I want weekday names and their 3-letter abbreviations ("mon", "tue"...) recognized as dates, so shorthand typing still works.
9. As a user, I want "next week" and explicit dates ("jan 27", "27/1") recognized, so a range of common phrasings all work.
10. As a user, I want matching to only trigger on whole words, so a task named "Monica's birthday" never gets "Mon" incorrectly carved out of it.
11. As a user, I want the longest possible match to win when multiple date rules could apply to the same words (e.g. "next week" over "next" + "week" separately), so recognition doesn't fragment obviously-related phrases.
12. As a user, I want to open the `DatePicker` popover and see a "Repeat" row (below the calendar, alongside where time is set), so I can set recurrence visually instead of only through typed keywords.
13. As a user, I want the Repeat row to offer "Every day", "Every week on <weekday>", "Every month on the <Nth>", "Every N days", and "Custom...", so common recurrence patterns are one click away.
14. As a user, I want a Custom Repeat dialog with "Based on" (Scheduled date / Completed date), "Every N <day/week/month/year>", and "Ends" (Never / On date), so I can express recurrence patterns beyond the quick presets.
15. As a user, I want recurrence anchored to "Completed date" to compute its next occurrence from when I actually complete the task, not the original due date, so tasks like "water the plants every 3 days" don't drift into overdue pile-ups if I complete them late or early.
16. As a user, I want a recurrence with an end date to stop generating new occurrences once that date has passed, so open-ended recurring tasks don't recur forever if I only wanted them for a season.
17. As a user, I want a global "Smart date recognition" toggle in Settings, so I can turn the whole feature off if I find it more annoying than helpful.
18. As a user, I want the toggle to live under a new General section on the existing Settings page (reachable via the avatar menu), so it's discoverable without adding new navigation.
19. As a developer, I want the recognition/parsing logic to live in one pure function separate from the input components, so it can be tested without rendering anything.

## Implementation Decisions

- **Grammar (v1)**: one-time dates (`today`/`tod`, `tomorrow`/`tom`, weekday names + 3-letter abbreviations, `next week`, explicit dates like `jan 27`/`27/1`), time-of-day (`at 4pm`), recurrence (`every day`/`daily`, `every week`/`weekly`, `every month`/`monthly`, `every N <day/week/month/year>`). Out of scope: relative offsets ("50 days before X"), `every weekday (Mon-Fri)`, deadlines, multi-language, a "no date" clear keyword.
- **Matching rules**: whole-word boundaries only, case-insensitive. When multiple grammar rules could match overlapping text, the longest match wins. Ambiguous matches (e.g. "monthly" inside "Create monthly report") are highlighted anyway, relying on click-to-reject rather than a blocklist/heuristic — matches Todoist's documented behavior.
- **Input UX**: not `contenteditable`. A transparent `<input>` is layered over a styled backdrop `<div>` that mirrors the text with highlighted spans, kept in sync on every keystroke — see ADR `0002-quick-add-highlighting-technique`. Matching runs live (debounced) as you type. Clicking a highlighted word rejects it for that compose session only (not persisted).
- **Field sync (`TaskComposer` only)**: last-touch-wins per field, bidirectional. Editing the title and getting a new/changed match overwrites `dueDate`/`startTime`/`recurrence`. Manually changing `DatePicker`/`TimeRangeInputs`/the Repeat row overwrites what parsing set and suppresses re-parsing that field until the matched phrase changes or disappears from the title. A picker/repeat change also rewrites the matched inline text to a canonical form (e.g. picking "tomorrow" via the calendar rewrites the title's "tomorrow" to "21.12"). Rejecting a highlighted match counts as a manual override too. `TaskQuickAdd` has no manual controls, so parsing there applies silently on submit with no sync logic needed.
- **Recurrence data model**: replace the `Recurrence` discriminated union (`daily`/`weekly`/`monthly`/`every_n_days`) with a single general shape — `{ n: number, unit: "day" | "week" | "month" | "year", basedOn: "scheduled" | "completed", until?: Date | null }`. See ADR `0001-unified-recurrence-shape`. No existing recurring-task data needs migrating (none propagated to the DB yet; if any surfaces, disable Google Calendar two-way sync, delete it, and re-sync from Google).
- **`basedOn: "completed"`** changes next-occurrence computation to advance from `completedAt` rather than `dueDate` — this touches the task-completion action, not just the picker.
- **`until`** needs enforcement wherever recurrence next-occurrence is computed — no further occurrence is generated once `until` has passed.
- **Repeat UI placement**: a row inside the `DatePicker` popover (below the calendar), not a separate pill. Options shown: `Every day`, `Every week on <weekday>` (weekday implied by the picked date), `Every month on the <Nth>`, `Every N days`, `Custom...` (opens the Custom Repeat dialog). `Every weekday (Mon-Fri)` and `Every year` as quick-preset options are explicitly excluded — `year` is reachable only via Custom, and a Mon-Fri filter doesn't fit the unified shape at all and isn't built.
- **Settings**: new `user_settings` table, one row per user, keyed by `userId`, holding only `smartDateRecognitionEnabled: boolean` (default `true`) for now — designed to be extended with more fields later (time format, date format, week start) but those are not built now. A new General section is added to the existing `app/(app)/settings/page.tsx` (which currently only has Calendars) with the one toggle, wired via a server action.

## Testing Decisions

- Primary seam: a pure `parseQuickAdd(text, referenceDate)`-shaped function returning matches, the stripped title, and the extracted `dueDate`/`startTime`/`recurrence`. Test the full grammar matrix here — every keyword, weekday abbreviations, whole-word-boundary rejection ("Monica" not matching "Mon"), longest-match-wins on overlaps, and recurrence phrase parsing — with no DOM involved.
- Secondary seam: the last-touch-wins sync reducer (title parse result + manual field edits → next field state + suppression flags), tested independently of the actual input components.
- Prior art in this repo for pure-function-first testing of date logic: `lib/recurrence.ts`'s `getNextDueDate` is already a small pure function; follow that pattern rather than testing through the rendered `TaskComposer`.
- Not tested directly: the backdrop-overlay rendering/highlighting itself (visual, low-value to unit test) — cover it manually per `/verify` instead.

## Out of Scope

- Relative date offsets ("50 days before new year's eve"), `every weekday (Mon-Fri)`, deadlines, multi-language date parsing, a "no date" clear keyword.
- Rendering the fuller Date & time settings block (time format, date format, week start) — only the smart-recognition toggle is built now.
- Smart recognition applying to title edits after creation — `task-edit-dialog.tsx` currently renders the title as static text with no edit affordance, so there's no post-creation surface for this to reach yet.

## Further Notes

- Grounded in Todoist's own help article on natural-language dates (fetched and indexed during grilling: `todoist-dates-and-time-help`), specifically the "Write dates in natural language," "Add a date," and "Recurring dates" sections.
- See `CONTEXT.md` for the `Recurrence`, `Anchor date`, `Smart quick-add`, and `Matched phrase` glossary entries, and ADRs `0001` and `0002` for the two decisions with real tradeoffs.
