# 4. Sign in with Google and return safely to the app

Status: in-progress (code-complete; real Google, physical iPhone and Mac app return pending)
Type: task

**Blocked by:** 2.
   **What it delivers:** Google sign-in and account linking return to the initiating browser, iPhone or Mac session without losing existing accounts.
   **Acceptance:** Use system authorization UI with a verifier/state-bound, expiring, single-use handoff; verify cold/warm app return, cancellation, expiry and replay rejection; keep Google/session credentials out of URLs and logs; preserve server callback compatibility. Includes deep-link registration needed for auth, not every task route.

## Comments

Published from the approved implementation proposal on 2026-10-04. Eligibility requires every listed blocker to be complete.

2026-10-15 implementation (evidence: `docs/qa/tauri-google-oauth.md`):

- Browser uses Better Auth's own social sign-in/link endpoints and returns to the
  initiating page; legacy `/api/auth/callback/google` unchanged (tested).
- Native: system browser (Safari via opener plugin, not a webview), Rust-held
  32-byte verifier + state in Keychain, server `native-oauth` Better Auth plugin
  issuing a 2-minute single-use code bound to the S256 challenge; only
  `app.todalo.client://oauth/callback` registered. Tokens never reach JS, URLs or
  logs (checked in tests and the simulator's unified log).
- Verified: server/client/Rust tests for state binding, expiry, replay and
  cancellation; browser walkthrough with a fake Google; iPhone 17 Pro simulator
  warm return, replay ignored, cancellation.
- Cold return on the simulator needs one extra tap: tao 0.37.1 drops the URL that
  cold-launches an iOS scene; the pending flow survives and the "Return to todalo"
  page completes it.
- Not verified: real Google (console configuration listed in the QA doc), physical
  iPhone, Mac app return. Before release: universal link or
  ASWebAuthenticationSession to remove custom-scheme interception risk.

2026-11-06 — Mac debug app (API on 127.0.0.1:3000, real DB): real Google sign-in returned to the running app. Cold-start return and cancellation still to check; see `../mac-acceptance.md`.
