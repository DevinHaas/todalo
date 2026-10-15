# Native feasibility gate — ticket 10

Date: 15 October 2026. Branch `codex/tauri-migration`, walkthrough built from
`98da7e5` plus the CSP fix `60c0627` (found during this walkthrough).

**Gate status: provisionally approved — physical iPhone and signed Mac pending.**
Broad feature migration (tickets 11–22) may start. The hardware checklist at the
end must pass before tickets 23/24 (release candidates) and before the support
matrix below is published as final.

## Identities

| Item | Value |
| --- | --- |
| Host | Mac17,8 (arm64), macOS 26.7.1 (25G241) |
| Toolchain | Xcode 26.0.1 (17A400), iOS SDK 26.0, rustc 1.99.0, Bun 1.3.9 |
| Tauri stack | tauri 2.12.1, wry 0.57.0, tao 0.37.1, tauri-plugin-deep-link 2.6.2 |
| iOS target | iOS Simulator iPhone 17 Pro, iOS 26.0.1, UDID 265B8EC3-2299-454A-89E6-595F2A3BB217 |
| iOS build | `TAURI_TODALO_API_BASE_URL=http://127.0.0.1:3069 bun tauri ios build --debug --target aarch64-sim --ci`; bundle `app.todalo.client` 0.1.0, `MinimumOSVersion` 15.4, only `http://127.0.0.1:3069` baked in |
| Mac build | `TODALO_API_BASE_URL=http://127.0.0.1:3069 bun tauri build --debug --bundles app --ci`; `todalo.app` 41.63 MiB, arm64 only, `LSMinimumSystemVersion` 12.0, ad-hoc signed, `NSMicrophoneUsageDescription` present |
| API | Disposable in-memory QA API (`apps/client/scripts/auth-smoke-server.ts`, port 3069, `QA_CLIENT_ORIGIN=http://localhost:5199`) with fake Google and fake transcription. Vite on 5199. Port 3001 and production data were not touched. |

Screenshots: [`tauri-feasibility-gate/`](tauri-feasibility-gate/).

## Walkthrough results

Legend: **V** verified here, **V(sim)** verified in the iOS Simulator only,
**—** not verified in this run.

| Capability | iOS Simulator | Mac debug app | Browser (Chromium) |
| --- | --- | --- | --- |
| Email sign-in (Rust → Keychain bearer) | V(sim) `ios-01` | — (control denied) | V |
| Session survives app relaunch and full simulator shutdown/boot | V(sim) | — | V (reload) |
| Sign-out, then relaunch stays signed out | V(sim) | — | — |
| Google via system browser, warm return | V(sim) fake Google, `ios-11` | — | V in ticket 4 |
| Google cold return | **one extra tap** (see decision 3), `ios-10` | — | n/a |
| Today read, create / complete / delete task over native IPC | V(sim) `ios-03`, `ios-04` | — | V `browser-01` |
| Completion feedback | V(sim): log shows `UINotificationFeedbackGenerator` called once per completion (simulator cannot play haptics) | n/a (no-op) | n/a (no-op) |
| Projects list / create / open / rename / delete (native commands) | V(sim) `ios-07` | — | V in ticket 8 |
| Upload: Photo picker → raw-body IPC with custom headers in WKWebView | V(sim): 45,200-byte PNG → file task, `ios-05` | — | V: text file upload `browser-02` |
| Download: `save_attachment` to Files › On My iPhone › todalo | V(sim): saved file is byte-identical (SHA-256 prefix `f7b5f7210b0e3a4a`), `ios-06` | — (Downloads path) | V; also downloaded the iOS-uploaded PNG, 45,200 bytes |
| Ramble: mic capture → PCM16 → one-use ticket socket → transcription | V(sim) after fix: "Listening", 12.3 s / 123 frames, Stop finalises, `ios-09` | — | cookie + ticket paths V via `scripts/ramble-smoke.ts` (no live Chromium mic) |
| Microphone OS permission prompt | — simulator grants WebKit a "Mock audio device"; no TCC prompt appears | — | — |
| Software keyboard in composer | V(sim) with hardware keyboard disconnected — see finding 2 | n/a | n/a |
| Secrets out of logs | V(sim): 31,860 unified-log lines contain no `set-auth-token`, `Bearer `, `verifier`, `ticket=`, `oauth/callback`, password; the only `code=` hits are the system photo picker's own URL | — | — |
| Cross-client consistency | iOS deletions and iOS-uploaded file seen by the browser against the same API | — | V |

Mac app: the debug bundle built and launched, but the desktop-control request
for `app.todalo.client` was denied again, so no Mac UI step was exercised.
Scriptable Mac evidence instead: `cargo fmt --check`, `cargo test --locked`
(18 passed), and the ignored Apple Keychain round trip
(`cargo test --locked apple_keychain_round_trip_and_removal -- --ignored`, passed,
synthetic item removed). The CSP fix applies to the Mac webview too (same
`tauri.conf.json`), but Mac Ramble capture is unverified.

## Failures found

1. **Ramble could not record in either native app (fixed, `60c0627`).** The
   Tauri CSP `script-src 'self'` blocked the `blob:` AudioWorklet module;
   WKWebView rejected `addModule` with `SecurityError: Not allowed by CSP`, which
   the recorder maps to the "Microphone access is off" message — so it looked like
   a permission problem. Browser dev has no CSP, which is why tickets 6/9 did not
   see it. Fix: `script-src 'self' blob:` (blob URLs can only be minted by script
   already running in the page) plus `apps/client/src/tauri-csp.test.ts`.
   `ios-08` shows the failure, `ios-09` the fix.
2. **Composer and software keyboard (not fixed, layout).** With the hardware
   keyboard disconnected, focusing "Add task" opened the keyboard over the
   composer (`ios-02`) and the document scrolled so the toolbar slid under the
   status bar/Dynamic Island; once visible, typing and submitting worked. A stale
   autocorrect bubble also stayed on screen after a project form unmounted. These
   are layout polish, not auth/storage/audio; track with ticket 11 (task editing).
3. **OAuth cold return needs one extra tap (accepted, see decision 3).** Reproduced
   with tao 0.37.1: the launch URL is dropped; "Return to todalo" on the still-open
   Safari page completes sign-in.

Simulator notes for later QA: screenshots can be one frame stale (wait ~1.5 s);
the host's German layout breaks injected `@`/`-` (use `simctl pbcopy` + Paste);
`text` injection reconnects the hardware keyboard.

## Legacy site

- `bun run build` builds `@todalo/web` (legacy Next) alongside the API and the new
  client; `bun run test` (46 files, 410 tests) and `bun run typecheck` (7 tasks) pass.
- Not verified: the legacy Next app in a browser against a real database (needs
  production-like secrets), the legacy host serving `/api/auth/native-oauth/*`
  live, and a task created in the new client appearing in the legacy UI.

## Frozen decisions

1. **Support matrix (candidates, partly verified).**
   - iPhone: iOS **15.4** minimum — *unverified* (only iOS 26.0.1 simulator run;
     `MinimumOSVersion` 15.4 is what the bundle declares). arm64 device: compile only.
   - Mac: macOS **12** minimum — *unverified* (only macOS 26.7.1 run). arm64 only;
     Intel/universal not built.
   - Browser: current Chromium verified; Safari/Firefox unverified.
   Lower bounds may only be raised, not lowered, once hardware checks run.
2. **Auth transport:** native clients use a Better Auth signed bearer held only in
   Rust and stored in Apple Keychain; the webview never sees it. Browsers keep
   HttpOnly cookies with exact-Origin checks. No plaintext fallback.
3. **OAuth callback:** custom scheme `app.todalo.client://oauth/callback` with
   state + verifier, 2-minute single-use code, for development. Cold return is
   accepted with the extra "Return to todalo" tap. **Before release** (ticket
   23/24): switch to an owned-domain universal link or `ASWebAuthenticationSession`
   to remove custom-scheme interception and the cold-start gap.
4. **Realtime:** Ramble sockets use 30-second one-use tickets minted by Rust with
   the bearer; browsers use cookie + Origin.
5. **Attachments:** raw-body IPC (`upload_files` with metadata headers) and
   native `save_attachment` (iOS: app Documents exposed in Files; Mac: Downloads).
6. **Audio:** shared web capture (AudioWorklet from a `blob:` module) in all
   clients; no native audio adapter unless a physical device fails.

## Hardware re-run checklist (required before tickets 23/24)

Physical iPhone (Developer Mode on, signed development build, reachable HTTPS test API):

- [ ] Email sign-in, relaunch persistence, sign-out, sign-in after reboot.
- [ ] Google: real Google consent; warm return; cold return (extra tap) or the
      universal-link replacement; cancel.
- [ ] Create, complete (feel the haptic; toggle opt-out; iOS System Haptics off), delete.
- [ ] Projects create/rename/delete/open.
- [ ] Upload from Photos and from Files; save attachment and open it in Files.
- [ ] Ramble: first-run microphone prompt (Allow), live transcription, Stop; deny
      in Settings › todalo → permission message; background while listening;
      phone-call/Siri interruption.
- [ ] Composer with the software keyboard (finding 2) on a notched device.
- [ ] Unified log scan for tokens/codes, as above.
- [ ] Oldest available iOS ≥ 15.4 device or record the raised minimum.

Signed Mac (Developer ID, hardened runtime with `com.apple.security.device.audio-input`):

- [ ] All of the above that apply, including Ramble with the macOS microphone
      prompt and System Settings denial, and `save_attachment` to Downloads.
- [ ] Google deep-link return to the running app and from a quit app.
- [ ] Keychain item survives app update/relaunch; signed-out state after quit.
- [ ] macOS 12 machine (or raise the minimum); Intel or universal decision.
