# 14b: Morning Check-in plans the day, Evening review rates progress, ritual notifications

User feedback on stage 3 (rituals). Reworks tickets 11 and 12.

**What to build:**

1. **Check-in (morning) = plan today.** It no longer asks the per-goal progress ratings. Steps:
   - Inbox tasks worth scheduling today: open inbox tasks plus overdue and due-today tasks that have no time yet. Goal-linked tasks first (goal colour dot), then the rest. Each row: schedule it today at a time (quick time pick, default the next free slot), set a due date, or leave it. Keep it to the shared UI library.
   - Then today's schedule with the unscheduled sidebar (what ticket 12's "Yes" opens) so the user can adjust by hand, and a Done button. Ticket 12's "Do you need help planning?" question goes away; the `planning` column stays (additive) and is simply not written any more.
   - Works without an AI provider. Relevance is rules only (goal-linked, overdue, due today); the Coach (stage 5) ranks later.
2. **Evening review (new ritual) = rate today's progress.** The per-goal rating step with optional context that the Check-in had, now reflecting on *today* (period = today). Own setting: enabled + time (default 20:00), shows on the schedule as a recurring item exactly like the Check-in task does (so Google Calendar gets it). Its own sidebar entry, shortcut, run recording. New ritual kind via an additive migration (`ALTER TYPE ... ADD VALUE`, new settings columns with defaults). Existing Check-in runs with ratings remain valid history: the Weekly review summary and the Season review rating history read ratings from both kinds.
3. **Notifications when a ritual is ready.** At a ritual's time (Check-in, Evening review, Weekly review), if it is enabled and not done or skipped for its period, show a native notification ("Your Evening review is ready"); clicking it opens the app on that ritual. Mac via `tauri-plugin-notification` (ask for permission the first time a ritual is enabled), browser `Notification` on web. Client-side timer while the app runs is enough for now (ponytail note: server push when the app is closed comes with ticket 27). One notification per ritual per period. A per-user toggle "Notify me when a ritual is ready" in Settings › Rituals, default on.

**Status:** resolved

- [x] Check-in shows inbox / overdue / due-today candidates, goal-linked first, and can schedule each today at a time or give it a due date
- [x] Check-in then shows today's schedule with the unscheduled sidebar; no ratings and no planning question any more
- [x] Evening review ritual: settings (enabled, time), recurring schedule item, sidebar entry, per-goal ratings for today, keyboard command
- [x] Weekly review and Season review history include Evening review ratings (and old Check-in ratings)
- [x] Ritual-ready notifications on Mac and web, once per ritual per period, toggle in settings, click opens the ritual
- [x] Additive migration only, applied
- [x] Behaviour covered by tests at the API seam (route factory with in-memory fakes); pure logic table-driven in packages/server
- [x] Any new user action has a keyboard command in the shortcut registry (no clashes)

Spec: ../spec.md. Vocabulary: CONTEXT.md (add "Evening review").
