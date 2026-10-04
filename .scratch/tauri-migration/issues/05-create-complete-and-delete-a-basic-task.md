# 5. Create, complete and delete a basic task

Status: ready-for-agent
Type: task

**Blocked by:** 3.
   **What it delivers:** A user adds a nonrecurring task, sees it in Today or Inbox, completes it or deletes it, and sees the result in the legacy web app.
   **Acceptance:** Extract only these server operations and reuse them from both transports; preserve validation, authorization, existing calendar side effects and cache/count updates; test ambiguous create/completion responses using operation IDs before enabling retries; retain input on failure. Rich editing and recurrence controls follow in ticket 11.

## Comments

Published from the approved implementation proposal on 2026-10-04. Eligibility requires every listed blocker to be complete.
