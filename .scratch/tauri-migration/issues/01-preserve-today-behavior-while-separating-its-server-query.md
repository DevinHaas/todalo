# 1. Preserve Today behavior while separating its server query

Status: completed
Type: task

**Blocked by:** None.
   **What it delivers:** The existing Today page behaves identically while its authenticated task query becomes reusable by a second client.
   **Acceptance:** Preserve ownership and date semantics with regression coverage; capture deterministic desktop/mobile visual baselines and an operation inventory for the whole migration; assign each inventoried capability to a proposed ticket and record current test failures. No broad mutation extraction.

## Comments

Published from the approved implementation proposal on 2026-10-04. Eligibility requires every listed blocker to be complete.

Implemented 2026-10-04: shared `@todalo/server/today` query with legacy read wrappers;
five passing ownership/local-day/DST/project regressions; server and web typechecks
pass. Before implementation, isolated-install baseline was 27 files / 281 tests
passing (initial symlink-only environment resolution failures documented).
Actual desktop/mobile fixture screenshots and reproducible scripts are in
`docs/qa/tauri-baseline*`; all routes/operations map to tickets 1–28 in the inventory.
Capture rerun: Chromium 154, 1440×1000 and 390×844, two rows each, no page errors or
horizontal overflow. Temporary app routes removed and cleanup verified. Screenshot
evidence uses the whole legacy layout/component fixture, not live account data or
Apple-device evidence. No acceptance blockers remain for ticket 1; later transport
and physical-device gates remain with their owners.
