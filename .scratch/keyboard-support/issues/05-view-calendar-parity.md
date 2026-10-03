# 05: Layout switching and Upcoming/calendar navigation

Type: task
Status: claimed
Blocked by: 02, 03

## What to build

Deliver keyboard layout switching, Upcoming today/week movement and personal calendar view today/week movement. Preserve existing calendar integrations. Implement verified defaults and document disputed Windows Option entry without silently inventing parity.

## Acceptance criteria

- [x] Shift+V switches supported layouts and saved override dispatch works.
- [x] Upcoming today/previous/next-week commands work with explicit platform defaults.
- [x] Personal project/calendar view supports task dates and today/week navigation while retaining Google events.
- [x] Context precedence prevents task T/date and calendar T/today collisions; focus is retained and tests cover view navigation.

## Context

[Canonical specification](../spec.md). Original research and reference are linked there. The implementation request approves all four stages; no further start confirmation is required.

## Comments

Calendar implementation: `apps/web/lib/view-navigation.ts` provides the tested date/layout navigation seam. Mounted view registrations use effective customized bindings; task-specific actions require actual DOM task focus, and declined exact bindings fall through to calendar navigation. The CalendarView date cursor persists across month/week range changes. Upcoming extends its day window for prior/future week navigation and scrolls without moving focus. Project calendar loads owned Google events as contextual overlays and schedule slot creation retains the project destination. Today retains its existing day/overdue schedule and does not register unsupported week navigation.

Verification: focused red/green tests in `apps/web/lib/view-navigation.test.ts` and `apps/web/lib/keyboard.test.ts`; 17 tests passed across view navigation, keyboard, and task keyboard suites. Full web TypeScript check passed; ESLint passed for all changed web files; `git diff --check` passed. Integration browser checks remain assigned to ticket 07. Windows calendar Option alternative remains unresolved in the command registry and research; verified Windows `T` and macOS `T`/`Alt+Shift+Y` are implemented.
