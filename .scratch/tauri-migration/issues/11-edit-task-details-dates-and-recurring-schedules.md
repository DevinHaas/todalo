# 11. Edit task details, dates and recurring schedules

Status: ready-for-agent
Type: task

**Blocked by:** 10.
    **What it delivers:** The user edits existing task details and schedules, completes recurring tasks and gets the correct next occurrence.
    **Acceptance:** Preserve the recurrence ADR, timezone/date serialization and calendar-write behavior; reuse authoritative rules from legacy and new transports; test invalid input, recurrence retry deduplication and stale/error states; keep dialogs and task detail synchronized. Labels and organization actions are separate tickets.

## Comments

Published from the approved implementation proposal on 2026-10-04. Eligibility requires every listed blocker to be complete.
