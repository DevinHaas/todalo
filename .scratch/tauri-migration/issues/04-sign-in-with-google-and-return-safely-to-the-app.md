# 4. Sign in with Google and return safely to the app

Status: ready-for-agent
Type: task

**Blocked by:** 2.
   **What it delivers:** Google sign-in and account linking return to the initiating browser, iPhone or Mac session without losing existing accounts.
   **Acceptance:** Use system authorization UI with a verifier/state-bound, expiring, single-use handoff; verify cold/warm app return, cancellation, expiry and replay rejection; keep Google/session credentials out of URLs and logs; preserve server callback compatibility. Includes deep-link registration needed for auth, not every task route.

## Comments

Published from the approved implementation proposal on 2026-10-04. Eligibility requires every listed blocker to be complete.

