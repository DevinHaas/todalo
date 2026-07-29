# 02 — parseQuickAdd pure function

**What to build:** A pure `parseQuickAdd(text, referenceDate)` function, independent of any UI, that recognizes date/time/recurrence language in a title string and returns the matches (with their positions), the stripped title, and the extracted `dueDate`/`startTime`/`recurrence`.

Grammar (v1): `today`/`tod`, `tomorrow`/`tom`, weekday names + 3-letter abbreviations, `next week`, explicit dates (`jan 27`, `27/1`), time-of-day (`at 4pm`), recurrence (`every day`/`daily`, `every week`/`weekly`, `every month`/`monthly`, `every N <day/week/month/year>`). Matching is whole-word, case-insensitive; longest match wins on overlaps (e.g. "next week" over "next" + "week"). Recurrence output uses the unified shape from ticket 01.

Out of scope: relative offsets, `every weekday`, deadlines, multi-language, a "no date" clear keyword.

**Blocked by:** 01 — needs the unified `Recurrence` shape to emit correctly-shaped recurrence matches.

- [x] `parseQuickAdd` returns matches with start/end offsets, the title with matches stripped, and extracted `dueDate`/`startTime`/`recurrence`
- [x] Full grammar matrix covered by tests: every keyword, weekday abbreviations, `every N <unit>`
- [x] Whole-word-boundary rejection tested (e.g. "Monica" does not match "Mon")
- [x] Longest-match-wins tested on overlapping candidates
- [x] No DOM/rendering involved — function is testable in isolation
