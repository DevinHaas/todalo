# Optional feedback when completing a task — ticket 7 evidence

Recorded 15 October 2026 against the isolated in-memory QA API
(`apps/client/scripts/auth-smoke-server.ts` with `QA_API_PORT=3017`,
`QA_CLIENT_ORIGIN=http://127.0.0.1:5177`, Vite on `127.0.0.1:5177`). No production
data; the user's port-3001 API untouched. Screenshots are in `docs/qa/tauri-feedback/`.

## Design

- Legacy web had no completion sound, haptic or animation (only the checkbox state
  change), so there was no legacy preference to port; no transition was added or
  changed and no Rive or AHAP asset exists.
- Semantic adapter `apps/client/src/feedback.ts`; `taskMutations` plays
  `taskCompleted` in the completion `onMutate` (instant, matches the optimistic
  check-off; `onSuccess` would lag a network round trip). Fire-and-forget: sync
  throws and async rejections are swallowed.
- iOS: one native command `feedback` (semantic enum only) → `tauri-plugin-haptics`
  2.4.0 `notification_feedback(Success)` → `UINotificationFeedbackGenerator`.
  The webview gets `allow-feedback` only, not the plugin's commands.
- Opt-out: per-device `localStorage` key `todalo.haptics`, default on, toggle on the
  Account screen, shown only in the iPhone/iPad app.
- Reduced motion does not silence the haptic (it is not motion); iOS's System
  Haptics setting is applied by UIKit.

## What was exercised

| Capture | Client | Result |
| --- | --- | --- |
| `ios-account-haptics-on.png` | iOS Simulator, iPhone 17 Pro, debug `aarch64-sim`, `TAURI_TODALO_API_BASE_URL=http://127.0.0.1:3017` | Signed in via fake Google (Google QA User). Created "Feel the Check", tapped its checkbox: row left, count 0. Simulator log at 21:32:19.051: `UIKit:Feedback generator <UINotificationFeedbackGenerator …> cannot play feedback … (enabled=0)` — the call reached UIKit; the simulator has no haptic engine. Exactly one such line for the completion. Account screen showed the toggle checked by default. |
| `ios-account-haptics-off-after-relaunch.png` | same | Unchecked the toggle, relaunched the app (new process ID in the log): still signed in, toggle still unchecked. Created and completed "Quiet Check": completion succeeded and no further `UINotificationFeedbackGenerator` line was logged. |
| `web-account-no-haptics-toggle.png` | Chromium (Playwright), `prefers-reduced-motion: reduce` emulated | Signed in as `existing@example.test`, completed "Plan the first shared screen": row left, badge 2 → 1, no error; `/api/v1/today` showed it `done`, `openCount` 1. No Tauri runtime, nothing stored under `todalo.haptics`, Account screen shows no haptics setting. |

## Automated coverage

- `apps/client/src/feedback.test.ts`: preference default on / persisted opt-out /
  storage unavailable; adapter plays only while enabled; sync throw, async rejection
  and a throwing preference never escape; plays under emulated reduced motion;
  completion plays once on mutate before the server answers, not again on retry;
  a throwing native adapter never fails the completion; create/delete never play.
- `src-tauri/src/feedback.rs`: only the `taskCompleted` event deserializes and maps
  to `Success`.
- Root `bun run test` (409), `typecheck`, `build`, `cargo fmt --check`,
  `cargo test --locked` passed. `bun run lint` shows only the 3 known `apps/web` errors.

## Not verified

- **Physical iPhone:** the haptic was not felt; no device was available. Needed:
  completion produces one success haptic with the toggle on, none with it off,
  none with Settings → Sounds & Haptics → System Haptics off, and none of this
  with Reduce Motion on changes the result.
- iOS Reduce Motion was not toggled in the simulator (shared device, system
  setting); reduced motion was checked in the browser only.
- The Mac app was not run; Mac uses the JS no-op (no `invoke`), and the plugin's
  desktop build is a no-op compiled by `cargo test`.
- iPad in desktop-site mode reports a Mac user agent and would get no toggle or
  haptic (`hapticsSupported` is a user-agent check).
- Sandboxed builds: SwiftPM could not fetch `swift-rs` for the new plugin
  ("no connectivity", then "already exists"). Seeding the plugin's `out/swift-rs`
  build directory from the already-built opener plugin's resolved checkout let the
  build succeed; a normal networked build needs no workaround.
- The iOS build included another agent's uncommitted ticket-9 work in the shared worktree.
