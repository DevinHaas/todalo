# Spec: Goals, Seasons, Rituals and the Coach

Status: ready-for-agent

Vocabulary follows `CONTEXT.md` (Goal, Season, Primary goal / Secondary goal, Milestone, Done criteria, Goal status, Time block, Rituals, Check-in, Weekly review, Season review, Progress rating, Energy rating, Coach, Draft, Pattern). Relevant ADRs: 0005 (stage-then-commit), 0007 (ChatGPT OAuth for the Coach), 0008 (one Tauri client for web, Mac and iPhone).

## Problem Statement

Habito is a fast task manager, but it only answers "what do I have to do?". It does not answer "what am I working towards, am I on track, and what should I spend this week on?". Tasks pile up with no link to the outcomes they serve, the calendar fills with whatever is urgent, and there is no moment where the user steps back to plan, reflect, or notice that a goal they care about has quietly stalled. Tools that do this (e.g. Superfocus) are separate, paid and closed, so the user would have to keep two systems in sync.

## Solution

Goals become the top level of Habito. The user plans each **Season** (12 weeks, 4 weeks, or custom) around a small set of **Primary goals** and some **Secondary goals**, links projects and tasks to them, and defines **Milestones** with **Done criteria**. Time is reserved on the schedule as **Time blocks**, dragged in from a sidebar of unscheduled tasks or reserved for a goal before tasks exist. Optional **Rituals** (daily **Check-in**, **Weekly review**, **Season review**) run a Plan → Focus → Reflect cycle in which the user gives **Progress ratings**. Each goal gets an algorithmic **Goal status** (On track / Adjust / Off track) shown on a trajectory chart with a projection. An AI **Coach** explains the status, learns visible **Patterns**, chats in a sidebar, and proposes every change as a **Draft** (dashed, accept or decline). Accountability notifications nudge the user back to primary goals. Everything works without goals or AI: users can hide goals, choose which rituals they do, and run without an AI provider.

The build is staged (each stage usable on its own, everything before stage 5 usable without AI):

1. Goals and Seasons
2. Time blocking
3. Rituals with progress ratings
4. Goal status and trajectory chart
5. Coach, Drafts, planning session, chat, recommendations, Patterns
6. Energy ratings and accountability notifications

## User Stories

### Goals

1. As a user, I want to create a goal with a title and description, so that I can name an outcome I am working towards.
2. As a user, I want goals to be the top level of the sidebar, so that I see what I am working towards before the work itself.
3. As a user who doesn't work with goals, I want to hide goals from the sidebar, so that Habito stays a plain task manager for me.
4. As a user who hid goals, I want projects, tasks, time blocks, rituals and the Coach to keep working, so that hiding goals removes nothing else.
5. As a user, I want to link a goal to many projects, so that a goal like "Become fit" can be served by "Run marathon" and "Meal prep".
6. As a user, I want to link one project to several goals, so that shared work counts everywhere it matters.
7. As a user, I want to link an individual task to one or more goals, so that "Eat enough protein" counts for both "Become fit" and "Build muscle".
8. As a user, I want linking to be explicit and manual, so that nothing counts towards a goal without my say.
9. As a user, I want Habito to suggest goals for a task (e.g. from goals that sibling tasks in the same project or with the same labels already link to), so that linking is quick.
10. As a user with an AI provider set up, I want the Coach to also suggest goals by meaning, so that "Eat enough protein" is suggested for "Build muscle" even with no shared project or label.
11. As a user, I want suggestions to appear only as a hint I can accept or dismiss, so that they never link anything on their own.
12. As a user, I want a goal page listing its linked projects, linked tasks, milestones and status, so that I can see everything that serves the goal.
13. As a user, I want to archive a goal I've finished or abandoned, so that it stops cluttering current seasons but keeps its history.
14. As a user, I want to reorder goals, so that the sidebar reflects what matters most to me.

### Seasons

15. As a user, I want to start a season with a start date and a length of 12 weeks, 4 weeks or a custom number of days, so that I can plan long seasons or short sprints.
16. As a user, I want exactly one current season at a time, so that "this season" is always unambiguous.
17. As a user, I want to add goals to a season, so that I commit to what I'll work on in this time box.
18. As a user, I want to set each goal's target for this season in words, so that I know what "done for this season" means even for unstructured goals.
19. As a user, I want to move a goal's target mid-season, for example when I've already reached it, so that the goalpost stays honest.
20. As a user, I want a goal to continue across several seasons with a new target each time, so that long-term goals don't have to be recreated.
21. As a user, I want to mark each goal in a season as Primary or Secondary, so that it's clear what gets my best time.
22. As a user, I want a goal to be primary in one season and secondary in the next, so that priorities can shift.
23. As a user, I want to be warned when I set more than three primary goals, so that I stay focused.
24. As a user with the Coach enabled, I want it to estimate how much time my primary goals need against my available time, so that the real limit on primary goals is capacity, not a fixed number.
25. As a user, I want to see the current season's day count ("Day 52 of 84") and days left, so that I feel the time box.
26. As a user, I want past seasons kept with their goals, targets and statuses, so that I can look back.

### Milestones and done criteria

27. As a user, I want to mark a task as a milestone for a goal, so that key steps stand out from ordinary tasks.
28. As a user, I want to add done criteria to a milestone, so that "reached" has a specific, checkable meaning.
29. As a user, I want to tick done criteria myself, so that I decide when each condition is truly met.
30. As a user, I want a milestone to count as reached only when all its criteria are ticked, so that progress isn't overstated.
31. As a user completing a milestone task with open criteria, I want to be asked to confirm and then have all criteria ticked, so that I can't accidentally skip the check.
32. As a user, I want milestones to keep their due dates, deadlines and calendar sync as ordinary tasks, so that I don't learn a second kind of item.
33. As a user, I want the goal page to list milestones in order with their criteria progress, so that I see the path to the goal.

### Time blocking

34. As a user, I want to create a time block on the today or week schedule by dragging over an empty slot, so that I can reserve time.
35. As a user, I want to dedicate a time block to a goal without any task in it, so that I can reserve "2 h for Ship v2" before deciding the tasks.
36. As a user, I want to put one or more tasks into a time block, so that a "Deep work" block can hold several related tasks.
37. As a user, I want scheduling a single task to create a block holding just that task, so that the existing scheduling habit still works.
38. As a user, I want a sidebar of open unscheduled tasks next to the schedule, so that I can see what still needs a slot.
39. As a user, I want to drag a task from that sidebar onto a time slot or into an existing block, so that planning the day is direct manipulation.
40. As a user, I want to filter the unscheduled sidebar by goal, project, priority and label, so that I can plan one goal at a time.
41. As a user, I want to set a task's priority from the sidebar while planning, so that I don't have to leave the planner.
42. As a user, I want to move and resize blocks by dragging, so that adjusting the plan is quick.
43. As a user, I want blocks to show their goal's colour, so that I can see at a glance where my time goes.
44. As a user, I want time blocks to sync to my Google Calendar as events, so that others and my other devices see the time as busy.
45. As a user, I want my Google Calendar events shown alongside blocks, so that I plan around real meetings.
46. As a user, I want to mark a block as done, skipped or rescheduled, so that how well I kept my plan is recorded.
47. As a user, I want to see how much time is reserved for each goal this week, so that I notice when a primary goal is starved.
48. As a user on iPhone, I want to see and adjust today's blocks, so that the plan follows me.

### Rituals

49. As a user, I want to choose which rituals I do (Check-in, Weekly review, Season review), so that Habito fits how I work.
50. As a user, I want to choose when each ritual happens (e.g. Check-in at 09:00 daily, Weekly review on Sunday), so that they fit my week.
51. As a user, I want the Check-in to appear on my schedule as a recurring item, synced to Google Calendar, so that the habit is visible.
52. As a user, I want to start a ritual from its schedule item or from the sidebar, so that it's one click away.
53. As a user, I want rituals to run step by step in the right sidebar with a progress bar, so that they feel short and guided.
54. As a user in a Check-in, I want to give a progress rating per goal for yesterday (A massive amount, Solid, Mixed, Little progress, Not relevant), so that my own judgement feeds into goal status.
55. As a user, I want to add written or spoken context to each rating, so that the Coach understands why.
56. As a user in a Check-in, I want to be asked whether I need help planning today, and be able to say "No, I've got a clear idea", so that the ritual is short when I don't need help.
57. As a user, I want the planning step to show today's schedule and the unscheduled-task sidebar, so that I can plan by hand without AI.
58. As a user in a Weekly review, I want to see each goal's status for the season and plan next week's blocks, so that the week serves my goals.
59. As a user in a Season review, I want to look back on the season, decide which goals continue, set next season's targets and tiers, so that seasons chain together.
60. As a user, I want to skip or postpone a ritual without penalty in the app, so that rituals stay optional.
61. As a user, I want rituals never to block using the rest of Habito, so that I'm never forced through a flow.

### Goal status and trajectory

62. As a user, I want each goal in the current season to show On track, Adjust or Off track, so that I get an honest read on every goal.
63. As a user, I want status to be calculated from my progress ratings, reached milestones and how well I kept my planned blocks, so that it reflects both my judgement and my behaviour.
64. As a user, I want status calculated the same way every time, without AI, so that it's predictable and works offline from any provider.
65. As a user, I want "Too early" instead of a status in the first days of a season, so that one bad day doesn't paint a goal red.
66. As a user, I want a trajectory chart with one line per goal across the weeks of the season, banded into On track / Adjust / Off track, so that I see trends, not just today.
67. As a user, I want a dashed projection from today to the season's end, so that I see where each goal will land at the current pace.
68. As a user, I want to tap a goal on the chart to open its page, so that I can act on what I see.

### Coach and Drafts

69. As a user, I want to connect an AI provider with my ChatGPT sign-in, an API key, or a local Ollama model, so that the Coach runs on what I already have.
70. As a user without any AI provider, I want every non-Coach feature to work, so that AI is a bonus, not a requirement.
71. As a user, I want the Coach to explain each goal's status in plain words, so that I understand the number.
72. As a user, I want the Coach to give specific recommendations ("Move Ship v2 to your mornings — its Thursday afternoon blocks were rescheduled three times since week 5"), so that I know how to get back on track.
73. As a user, I want each recommendation to offer "Update block", "Chat with coach" and dismiss, so that acting on advice is one click.
74. As a user, I want the Coach to draft my day after a Check-in and my week in a Weekly review, so that I start from a plan rather than a blank calendar.
75. As a user, I want drafted changes shown as dashed blocks on the schedule, so that I can tell proposals from my real plan.
76. As a user, I want a summary of a draft ("4 added, 1 moved, 1 removed") with the Coach's reasoning, so that I can judge it quickly.
77. As a user, I want to accept or decline a whole draft, or individual items in it, so that I keep what fits.
78. As a user, I want nothing in a draft to touch my real calendar until I accept, so that I'm never surprised.
79. As a user, I want the Coach to never change anything directly, only through drafts, so that I'm always in control.
80. As a user, I want a planning session where I ramble or type about a goal, and the Coach asks multiple-choice follow-up questions (with "Something else…" and voice input), so that it finds missing tasks the way a good coach would.
81. As a user, I want the planning session to end with a draft of new tasks, milestones and blocks, so that the conversation turns into a plan.
82. As a user, I want to open a planning session from season setup, a Weekly review, or a goal page, so that I can plan at any level.
83. As a user, I want a Coach chat in the right sidebar where I can ask what to change, so that I can think out loud with it.
84. As a user, I want proposals from the chat to arrive as drafts too, so that chat never edits my data.
85. As a user, when time runs short, I want the Coach to draft dropping or postponing secondary-goal work first, so that primary goals stay protected.
86. As a user, I want the Coach to keep reminding me of my primary goals when I plan, so that I don't drift.

### Patterns

87. As a user, I want to see the patterns the Coach has learned about me ("ships best in the mornings", "admin is draining"), so that its advice is transparent.
88. As a user, I want to edit or delete any pattern, so that I can correct it when it's wrong.
89. As a user, I want the Coach to use only patterns I can see, so that there's no hidden profile.

### Energy ratings

90. As a user, I want to rate an occurrence of a task, block or calendar event as Energizing or Draining, so that the Coach learns what fuels me.
91. As a user, I want to rate per occurrence rather than per task, so that changing moods and circumstances are captured.
92. As a user, I want recent ratings to count more than old ones, so that the Coach follows how I am now.
93. As a user, I want rating to be optional and quick (one key or tap), so that it never feels like admin.
94. As a user, I want the Coach to use energy ratings when drafting (e.g. draining work earlier, energizing work as a lift later), so that plans fit my energy.

### Accountability notifications

95. As a user, I want a notification when a goal drops to Adjust or Off track, so that I react early.
96. As a user, I want a notification when I skip a primary-goal block, so that I notice drift the same day.
97. As a user, I want a notification when I miss a Check-in, so that the habit holds.
98. As a user, I want at most two accountability notifications a day and quiet hours, so that nudges don't become noise.
99. As a user, I want notifications as native notifications on Mac and iPhone and browser notifications on web, so that they reach me wherever I am.
100. As a user, I want a banner in Today and the week view when no primary-goal time is planned, so that I'm nudged in context too.
101. As a user, I want to turn each notification trigger on or off, so that I control what reaches me.

### Cross-cutting

102. As a user, I want all of this on web, Mac and iPhone from one client, so that my plan is the same everywhere.
103. As a keyboard user, I want shortcuts for creating goals, linking a task to a goal, starting a ritual and accepting or declining a draft, so that the new features keep Habito's keyboard-first feel.
104. As a user, I want my goals, ratings and patterns sent to an AI provider only when I've connected one, so that my data stays with me otherwise.

## Implementation Decisions

- **Platform.** Built once in the shared Tauri client, which serves web, Mac and iPhone (ADR 0008). The Elysia API and the server package own all rules; the client stays thin. The legacy Next.js web app is not extended.
- **Branching.** Work starts on a feature branch off `main` after the Tauri migration (at its committed state) is merged into `main`.
- **New domain modules on the server** (each a deep module with a small interface, following the existing route-factory-with-injected-dependencies pattern):
  - *Goals*: create, update, archive, reorder; link and unlink goal↔project and goal↔task (many-to-many both ways); list a goal's contributing work.
  - *Seasons*: create with start date and length (12 weeks, 4 weeks, custom days); enforce one current season; add goals with tier (primary/secondary) and per-season target text; move target; carry goals into the next season.
  - *Milestones*: a flag on a task linking it to a goal, plus an ordered list of done criteria with ticked state; completing a milestone with open criteria requires an explicit confirm that ticks all.
  - *Time blocks*: a block has start, end, optional goal, zero or more tasks, and an outcome (planned, done, skipped, rescheduled with a reschedule count). A lone scheduled task keeps its own start and end and is presented as a block holding just that task (no wide migration of the existing scheduling fields). Blocks push to Google Calendar through the existing calendar-sync module.
  - *Rituals*: per-user settings for which rituals are enabled and when; ritual runs recording progress ratings (goal, period, rating, optional context) and completion.
  - *Goal status*: a pure function from (season dates, today, progress ratings, milestone states, block outcomes) to a weekly score series, a projection to season end, and a status band (On track / Adjust / Off track / Too early). Thresholds and weights are constants in this module. No AI involvement.
  - *Goal suggestions*: a rule-based suggester (goals linked by sibling tasks in the same project or sharing labels), with an optional AI suggester layered on top when a provider exists.
  - *Coach*: a provider-agnostic inference interface with adapters for ChatGPT OAuth (ADR 0007), API keys for supported providers, and Ollama, reusing the provider approach from Ramble's semantic step (ADR 0006). The Coach reads goals, statuses, ratings, blocks, energy ratings and patterns; it only ever writes Drafts and Patterns.
  - *Drafts*: a draft is a staged set of operations (add, move, remove on tasks and blocks) with the Coach's rationale; it is validated as a whole, applied atomically on accept (whole or per item), and never touches the real calendar before acceptance. This extends the stage-then-commit approach of ADR 0005.
  - *Patterns*: user-visible, editable, deletable statements the Coach has learned, each with its source evidence; the Coach may only use stored patterns.
  - *Energy ratings*: per occurrence (task completion, block, or calendar event instance) with timestamp; aggregation weights recent ratings more heavily.
  - *Notifications*: trigger evaluation (status drop, skipped primary block, missed Check-in) with a per-user daily cap of two, quiet hours and per-trigger toggles; delivery via native notifications in the Tauri app and browser notifications on web.
- **Schema changes.** New tables for goals, goal↔project links, goal↔task links, seasons, season goals (tier, target text, carried-from), milestone done criteria, time blocks and block↔task links, ritual settings, ritual runs, progress ratings, energy ratings, drafts and draft items, patterns, notification settings and notification log. Tasks gain a milestone flag. All additive. Existing task scheduling (a task's own start and end) is not migrated: a scheduled task is presented as a single-task time block, and only goal blocks and multi-task blocks are stored as blocks.
- **API contract.** REST endpoints per module in the existing style, plus an extension of the existing live stream so drafts and status updates reach open clients.
- **Client.** New screens: goals in the sidebar (hideable), goal page, season setup and season page with the trajectory chart, ritual flows in the right sidebar, unscheduled-task sidebar beside the schedule, dashed draft rendering on the schedule with accept/decline, Coach chat sidebar, Patterns list in settings, AI provider settings, ritual and notification settings. Keyboard commands are added to the existing shortcut registry.
- **Planning session UI** reuses the Ramble capture for voice input and presents Coach questions as multiple-choice with "Something else…".

## Testing Decisions

- **What makes a good test here:** assert observable behaviour through the highest seam — HTTP requests in, responses and persisted effects out — not internal helpers. Pure rule modules are tested through their public function only.
- **Proposed seams (to be confirmed):**
  1. **API routes** (primary seam): each new route factory is tested by constructing it with in-memory fakes for its dependencies and driving it with HTTP requests, exactly as the existing route tests do (e.g. the import, task, calendar and Ramble commit route tests). This covers goals, seasons, milestones, blocks, rituals, drafts, patterns, ratings and notification settings.
  2. **Goal status function**: table-driven tests over synthetic seasons (ratings, milestones, block outcomes) asserting score series, projection and band, including "Too early" and boundary cases. Prior art: the server's task-rules tests.
  3. **Coach provider boundary**: the Coach is tested with a fake inference provider returning canned structured output, asserting that it only produces valid drafts and patterns and rejects invalid ones. Prior art: the semantic LLM and Ramble session tests.
- **Client:** Vitest for client-side logic that has no server equivalent (draft rendering state, drag-to-schedule mapping), following the existing client tests; no new E2E framework.
- **Modules tested:** all new server modules above; calendar sync extended for blocks; notification trigger evaluation (cap, quiet hours, toggles).

## Out of Scope

- Focus sessions / focus timer and focus-quality scoring (deferred).
- App and website blocking (deferred; would need native Screen Time APIs).
- Measurable goal metrics (numbers logged or derived automatically); v1 goals are tracked via milestones, ratings and blocks only.
- Monthly reviews.
- Calendars other than Google Calendar; Fathom, Granola, Slack integrations.
- Claude.ai and Gemini subscription sign-in.
- Focus music.
- A native Swift client (ADR 0008).
- Extending the legacy Next.js web app.

## Further Notes

- ChatGPT OAuth may break or be disallowed by OpenAI at any time (ADR 0007); API keys and Ollama must remain first-class.
- The Tauri worktree has an active, uncommitted task-detail redesign; expect small merge conflicts in the client's app shell and the schema when it lands.
- Status thresholds and weights are first guesses; expect tuning after real use, which is why they live as constants in one module.
