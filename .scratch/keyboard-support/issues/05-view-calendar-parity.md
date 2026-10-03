# 05: Layout switching and Upcoming/calendar navigation

Type: task
Status: open
Blocked by: 02, 03

## What to build

Deliver keyboard layout switching, Upcoming today/week movement and personal calendar view today/week movement. Preserve existing calendar integrations. Implement verified defaults and document disputed Windows Option entry without silently inventing parity.

## Acceptance criteria

- [ ] Shift+V switches supported layouts and saved override dispatch works.
- [ ] Upcoming today/previous/next-week commands work with explicit platform defaults.
- [ ] Personal project/calendar view supports task dates and today/week navigation while retaining Google events.
- [ ] Context precedence prevents task T/date and calendar T/today collisions; focus is retained and tests cover view navigation.

## Context

[Canonical specification](../spec.md). Original research and reference are linked there. The implementation request approves all four stages; no further start confirmation is required.

## Comments

