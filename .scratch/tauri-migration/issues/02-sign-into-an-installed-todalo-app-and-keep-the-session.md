# 2. Sign into an installed Todalo app and keep the session

Status: in-progress
Type: task

**Blocked by:** 1.
   **What it delivers:** A user signs in with an existing email/password account in the shared browser, iPhone and Mac client, sees their account identity, relaunches successfully and signs out.
   **Acceptance:** Introduce the minimum shared Vite/Tauri shell and account screen, preserving existing email registration alongside sign-in; prove native credential storage, session expiry/revocation and cache clearing; preserve browser cookie auth and legacy sessions; verify origin/CSRF behavior. Install development builds on physical iPhone and Mac and record Apple identity/toolchain/support-matrix decisions. No provider OAuth yet.

## Comments

Published from the approved implementation proposal on 2026-10-04. Eligibility requires every listed blocker to be complete.

2026-10-04: Ticket 1 is complete. Shared email sign-in/registration/account/logout,
Elysia auth mount and signed bearer transport, Rust Apple Keychain adapter, and
development browser/Mac/iOS shell are implemented. Focused checks and unsigned
Mac/simulator builds passed; see [evidence](../../../docs/qa/tauri-account-auth.md).
Ticket remains in progress pending enrolled signing identity, physical iPhone/Mac
session/lifecycle validation, and support-matrix confirmation. Dependent tickets
are not unlocked by the code or unsigned simulator artifact.
