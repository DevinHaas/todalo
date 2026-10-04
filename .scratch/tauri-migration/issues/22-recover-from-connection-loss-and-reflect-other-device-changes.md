# 22. Recover from connection loss and reflect other-device changes

Status: ready-for-agent
Type: task

**Blocked by:** 19, 20, 21.
    **What it delivers:** Users see accurate connection state, retain drafts after failures and see changes from another device after foregrounding/reconnecting or the defined polling interval.
    **Acceptance:** Exercise all migrated mutation categories, including attachments and bulk actions; stop polling in the background, clear account caches and handle stale edits explicitly; do not introduce offline writes or automatic unsafe retries. Basic failure handling and deduplication must already ship with each feature.

## Comments

Published from the approved implementation proposal on 2026-10-04. Eligibility requires every listed blocker to be complete.

