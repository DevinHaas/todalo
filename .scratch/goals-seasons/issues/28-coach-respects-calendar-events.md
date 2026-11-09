# 28: Coach plans around calendar events

**What to build:** Coach drafts (day, week, chat, planning session) treat the user's visible Google Calendar events as busy time, so they avoid overlapping them, along with already scheduled tasks. All-day events don't block time; the model only sees them as context. When the work doesn't fit in the open time left, the draft doesn't squeeze it in. Instead it lists the tasks that didn't fit and offers to put them on the next day that has room. The user confirms with one click, which re-drafts those tasks onto that day, or declines.

**Today:** the busy list is only scheduled tasks (`coach-planning.ts` `busy`, and the same in the day and week drafts). Calendar events are ignored, so drafts collide with meetings.

**Blocked by:** 19, 20

**Status:** done

- [x] Visible, non-all-day calendar events in the drafted range join the busy list in every draft kind
- [x] The draft parser rejects any item that overlaps a calendar event, the same way it rejects overlapping tasks
- [x] Items that don't fit come back as "overflow" with a reason and are not placed in the draft
- [x] The draft card shows the overflow: "3 tasks don't fit today. Schedule them tomorrow?" with Yes and No
- [x] Yes drafts the overflow onto the next day with room (the same draft rules, stale check on accept); No drops them
- [x] Setting in Settings › Coach, "Share event titles with the AI": off (default) sends only busy times, on sends titles too (user decision 2026-11-09)
- [x] Tests at the draft parser and API seam, with fakes for events

Notes (2026-11-09): events come from the Today/Upcoming read (getCalendarEventsForUser). The setting is `user_settings.coach_share_event_titles` via PATCH /settings; overflow is `coach_drafts.overflow` (migration 0039, additive). Yes places the overflow without a model call (quarter hours 08:00-22:00, around tasks and events, 15-minute breaks) as a day draft on the first day after the draft's days with room for all of it, within 14 days; it is answered through the accept/decline endpoints with `{ overflow: true }` (Mac: decide_draft's new optional args, no new command). Keys: o then y (Yes), o then d (No).

Spec: ../spec.md. Vocabulary: CONTEXT.md.
