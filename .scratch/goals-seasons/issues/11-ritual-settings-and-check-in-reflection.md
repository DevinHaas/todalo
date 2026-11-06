# 11: Ritual settings and Check-in reflection

**What to build:** A user chooses which rituals they do and when. The Check-in appears on the schedule as a recurring item (synced to Google Calendar); starting it opens a step-by-step flow in the right sidebar where the user gives a progress rating per current-season goal for yesterday, with optional written or spoken context. Rituals can always be skipped.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] Settings to enable Check-in, Weekly review and Season review and set their times
- [ ] Check-in shows on the schedule as a recurring item and syncs to Google Calendar
- [ ] Start a ritual from its schedule item or the sidebar
- [ ] Step runner in the right sidebar with a progress bar
- [ ] Progress rating per goal (A massive amount, Solid, Mixed, Little progress, Not relevant) with optional text or Ramble voice context
- [ ] Skipping a ritual never blocks the app
- [ ] Behaviour covered by tests at the API seam (route factory with in-memory fakes), following the existing route tests
- [ ] Any new user action has a keyboard command in the shortcut registry

Spec: ../spec.md. Vocabulary: CONTEXT.md.
