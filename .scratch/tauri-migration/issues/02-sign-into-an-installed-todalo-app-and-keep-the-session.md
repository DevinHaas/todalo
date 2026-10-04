# 2. Sign into an installed Todalo app and keep the session

Status: ready-for-agent
Type: task

**Blocked by:** 1.
   **What it delivers:** A user signs in with an existing email/password account in the shared browser, iPhone and Mac client, sees their account identity, relaunches successfully and signs out.
   **Acceptance:** Introduce the minimum shared Vite/Tauri shell and account screen; prove native credential storage, session expiry/revocation and cache clearing; preserve browser cookie auth and legacy sessions; verify origin/CSRF behavior. Install development builds on physical iPhone and Mac and record Apple identity/toolchain/support-matrix decisions. No provider OAuth yet.

## Comments

Published from the approved implementation proposal on 2026-10-04. Eligibility requires every listed blocker to be complete.

