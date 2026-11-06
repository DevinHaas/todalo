# 25. Stage the new browser deployment and rehearse rollback

Status: ready-for-agent
Type: task

**Blocked by:** 22.
    **What it delivers:** The shared browser client works on a staging deployment with deep-link refreshes, API proxying and unchanged provider callbacks, and can be rolled back without losing user data.
    **Acceptance:** Deploy server additions before client routing changes; exercise fallback exclusions for assets/APIs; verify legacy and installed-client compatibility; define the supported API/client window and rollback window; retain the previous web build and prove non-destructive rollback.

## Comments

Published from the approved implementation proposal on 2026-10-04. Eligibility requires every listed blocker to be complete.
