# 28: Coach plans around calendar events

**What to build:** Coach drafts (day, week, chat, planning session) treat the user's visible Google Calendar events as busy time, so they avoid overlapping them, along with already scheduled tasks. All-day events don't block time; the model only sees them as context. When the work doesn't fit in the open time left, the draft doesn't squeeze it in. Instead it lists the tasks that didn't fit and offers to put them on the next day that has room. The user confirms with one click, which re-drafts those tasks onto that day, or declines.

**Today:** the busy list is only scheduled tasks (`coach-planning.ts` `busy`, and the same in the day and week drafts). Calendar events are ignored, so drafts collide with meetings.

**Blocked by:** 19, 20

**Status:** needs-review

- [ ] Visible, non-all-day calendar events in the drafted range join the busy list in every draft kind
- [ ] The draft parser rejects any item that overlaps a calendar event, the same way it rejects overlapping tasks
- [ ] Items that don't fit come back as "overflow" with a reason and are not placed in the draft
- [ ] The draft card shows the overflow: "3 tasks don't fit today. Schedule them tomorrow?" with Yes and No
- [ ] Yes drafts the overflow onto the next day with room (the same draft rules, stale check on accept); No drops them
- [ ] Event titles go to the provider only as "busy" plus their times, unless the user allows titles (privacy)
- [ ] Tests at the draft parser and API seam, with fakes for events

Spec: ../spec.md. Vocabulary: CONTEXT.md.
