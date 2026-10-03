# Habito

A personal task management app: tasks with due dates, recurrence, and two-way Google Calendar sync.

## Language

**Recurrence**:
The repeating schedule attached to a task — an interval (`n` of a `day`/`week`/`month`/`year` unit), an anchor date (see Anchor date), and an optional end date.
_Avoid_: repeat rule, cron, schedule

**Anchor date**:
Which date a task's recurrence advances from when computing its next occurrence — either the task's scheduled due date, or the date the task was completed.
_Avoid_: recurrence base, basedOn

**Smart quick-add**:
The task-creation feature where natural-language keywords typed into a task's title (e.g. "mon", "every day", "at 4pm") are recognized and converted into structured fields — due date, time, recurrence — instead of staying part of the title text.
_Avoid_: NLP parsing, quick add parser, date recognition

**Matched phrase**:
The substring of a task title that smart quick-add has recognized as date/time/recurrence language. Highlighted inline while typing; removed from the title and applied to the task's fields once accepted (or on save). Rejecting it (click-to-unhighlight) leaves it as plain title text for that compose session.
_Avoid_: highlight, span, token

**Ramble session**:
A voice-driven task-capture flow, run in a modal, where speech is transcribed and segmented into todos that are staged (not yet saved) until the session ends with commit or discard.
_Avoid_: voice mode, dictation

**Sub-task**:
A task whose `parentId` references another task. Nesting is single-level only — a sub-task cannot itself have sub-tasks.
_Avoid_: child task, nested task
