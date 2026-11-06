# 7. Feel optional feedback when completing a task

Status: deferred (Mac-first scope, 22 Oct 2026)
Type: task

**Blocked by:** 5.
   **What it delivers:** Completing a task on iPhone produces standard haptic feedback that the user can disable, with safe behavior on web and Mac.
   **Acceptance:** Add a semantic feedback adapter and persisted opt-out; unsupported/failed feedback never fails the task operation; verify on a physical iPhone and with reduced motion. Preserve existing transitions without adding Rive or custom AHAP patterns.

## Comments

Published from the approved implementation proposal on 2026-10-04. Eligibility requires every listed blocker to be complete.

2026-10-15: Implemented the semantic adapter (`apps/client/src/feedback.ts`), a per-device opt-out on the Account screen (default on, iPhone/iPad app only) and one native `feedback` command over `tauri-plugin-haptics` (standard notification success). Feedback plays in the completion `onMutate` and swallows all errors. In the iOS Simulator the completion reached `UINotificationFeedbackGenerator` once (the simulator cannot play haptics), the opt-out survived a relaunch and suppressed the call; in Chromium with reduced motion emulated, completion worked and no setting appeared. Not felt on a physical iPhone and iOS Reduce Motion not toggled. Evidence: `docs/qa/tauri-feedback.md`.
