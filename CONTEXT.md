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

**Goal**:
An outcome the user is working towards, and the top level of how work is organised. A goal can be served by many projects, and any task can contribute to many goals (e.g. "Eat enough protein" in the project "Run marathon" contributes to both "Become fit" and "Build muscle"). Goals are optional: a user who hides them still works with projects and tasks as before.
_Avoid_: objective, OKR, target

**Season**:
A time box that the user's goals are planned and measured against: 12 weeks for a long season, 4 weeks for a short sprint, or a custom length. A goal can continue across several seasons, with its target set per season; the target can be moved at a season's end or earlier (e.g. when it is reached early).
_Avoid_: quarter, cycle, sprint

**Milestone**:
A task marked as a milestone for a goal, carrying explicit done criteria. The milestone counts as reached only once every criterion is met.
_Avoid_: key result, checkpoint

**Done criteria**:
The specific, checkable conditions attached to a milestone that define when it is reached.
_Avoid_: acceptance criteria, definition of done

**Progress rating**:
The user's own judgement, given during a review, of how much a period moved them towards a goal: *A massive amount*, *Solid*, *Mixed*, *Little progress*, or *Not relevant*, optionally with written or spoken context.
_Avoid_: score, self-assessment

**Energy rating**:
Whether one occurrence of a task (scheduled or not) or calendar event was **Energizing** or **Draining** for the user. Given per occurrence because energy changes with mood and circumstance; recent ratings count for more than old ones when learning when certain work is best scheduled.
_Avoid_: mood, tag

**Primary goal** / **Secondary goal**:
A goal's tier within one season. Primary goals get the user's best time and are protected; secondary goals are the first to be dropped or postponed when time runs short. A goal can be primary in one season and secondary in the next. Around three primary goals per season is the guideline, but the real limit is how much time they need.
_Avoid_: main focus, top priority

**Coach**:
The AI that helps the user plan, reflect and stay on their primary goals. The Coach never changes anything directly: everything it proposes arrives as a draft.
_Avoid_: agent, assistant, focus coach

**Pattern**:
Something the Coach has learned about how the user works (e.g. "ships best in the mornings", "admin is draining"). Patterns are always visible to the user, who can edit or delete them.
_Avoid_: insight, memory, learning

**Time block**:
A task with a start time and a duration, shown as a block on the schedule in its goal's colour (the first linked goal in sidebar order; a neutral colour without one). There is no separate block record: dragging over an empty slot creates a task with that time range, moving or resizing a block changes the task's own times, and unscheduling a task clears its time and duration while it keeps its day.
_Avoid_: event, slot, appointment, block outcome

**Check-in**:
The daily ritual: reflect on the previous day with progress ratings, then plan the day. It sits on the schedule as a recurring item.
_Avoid_: daily review, coach sync, standup

**Rituals**:
The check-in, weekly review and season review collectively. Each is opt-in per user: they choose which rituals they do, and the rest of the app (goals, time blocks, the Coach) works without any of them.
_Avoid_: routines, ceremonies

**Draft**:
A set of proposed changes to the user's tasks and schedule (added, moved, removed), shown as dashed, provisional items until the user accepts or declines them. Nothing in a draft touches the real calendar until accepted.
_Avoid_: suggestion, preview, pending changes

**Weekly review**:
A recurring, optional ritual where the user checks each goal's status for the current season and plans the coming week.
_Avoid_: check-in, retro

**Season review**:
The optional ritual at the end of a season where the user looks back on it, decides which goals continue, and sets their targets for the next season.
_Avoid_: quarterly review, retrospective

**Goal status**:
Where a goal stands against its season: **On track**, **Adjust**, or **Off track**. Always calculated from the user's progress ratings, reached milestones, and the goal-linked tasks completed or scheduled with the time spent on them; never set by hand or by the Coach.
_Avoid_: health, RAG status, trajectory

**Sub-task**:
A task whose `parentId` references another task. Nesting is single-level only — a sub-task cannot itself have sub-tasks.
_Avoid_: child task, nested task
