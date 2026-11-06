# 6. Record and transcribe a short Ramble session on Apple devices

Status: code-complete; live Apple microphone acceptance pending
Type: task

**Blocked by:** 2.
   **What it delivers:** The user starts a short recording in the installed app and sees real transcription from the existing Ramble service.
   **Acceptance:** Prove microphone permissions, sample conversion and ordered audio transport; choose and test authenticated native WebSockets or one-use socket tickets without weakening browser checks; stop/recover visibly on interruptions and permission denial. Add a native audio adapter only if the web capture cannot meet the requirement. Task staging/commit remains ticket 21.

## Comments

Published from the approved implementation proposal on 2026-10-04. Eligibility requires every listed blocker to be complete.

2026-10-15 implementation: one-use socket tickets (bearer-only mint through Rust, 30 s, single use) and the shared web capture (no native adapter). Browser cookie+Origin checks are unchanged. Unit, Bun socket and QA end-to-end evidence (tone → PCM16 → ordered frames → fake transcription on both the ticket and cookie paths), plus browser permission-denied, background and startup-timeout recovery, are in [docs/qa/tauri-ramble.md](../../../docs/qa/tauri-ramble.md). Not yet verified: live WKWebView microphone capture and the OS prompt on Mac/iOS, real provider transcription, physical iPhone. Manual steps are in the QA file.

2026-10-20 parity: microphone selection is now implemented in the shared client (`apps/client/src/ramble.ts` `selectMicrophone`, a "Choose microphone" select in `ramble-screen.tsx`), matching the legacy modal: "Default microphone" or a specific device via an exact `deviceId` constraint; the choice lasts for the screen visit only (not persisted); a live or failed capture restarts on the new device, a paused one uses it on resume; the list refreshes on `devicechange` and again once listening, since labels are empty before permission ("Microphone N" fallback). Unit-tested in `ramble.test.ts`. Not yet verified: device lists inside WKWebView on Mac/iOS.
