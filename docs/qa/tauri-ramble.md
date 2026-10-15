# Ticket 6 — Ramble recording and transcription on Apple clients

Recorded 15 October 2026 on branch `codex/tauri-migration` (macOS arm64, Xcode iOS 26.0.1 simulator).
No transcription-provider credentials were used. The user's own API on port 3001 was never contacted.

## Decisions

- **Socket auth: one-use socket tickets.** WebView WebSockets cannot carry the Keychain bearer.
  Native JS calls the `ramble_socket` IPC command. Rust reads the bearer from the Keychain and
  sends `POST /api/ramble/ticket` with it. The server returns a 32-byte random base64url ticket that
  expires in 30 s and is deleted on first lookup, whether the lookup succeeds or not. Rust validates
  the ticket's shape and returns only `ws(s)://<API origin>/api/ramble/ws?ticket=…`. The bearer never
  reaches JS, URLs, web storage or logs. The ticket does reach the URL, but it is useless after the
  upgrade.
- **Browser checks unchanged.** Without `?ticket`, the upgrade still requires an exact allowed `Origin` plus the
  cookie session. Ticket minting accepts only an explicit `Authorization: Bearer` header; cookies are
  stripped before verification, so an ambient browser session cannot mint tickets (no new CSRF path).
  A ticket socket ignores cookies, so the two paths never mix.
- **Capture: shared web capture, no native adapter.** `getUserMedia` + AudioWorklet PCM16/16 kHz moved
  unchanged from `apps/web/lib` to `@todalo/ramble/audio` and is used by web and client. WKWebView
  should support this on the target OS versions. That still needs proof with a granted microphone
  (see Unverified). A native adapter would only be justified after that check fails.
- **Interruptions:** a microphone track ending, an AudioContext leaving `running` (WebKit reports
  `interrupted` for calls/Siri), app hidden/`pagehide`, socket loss, server error and a 30 s startup
  timeout all stop capture, send `discard`, close the socket and show a recoverable message with
  "Try again". No background recording.
- Process-local ticket store (`ponytail:` note in `socket-tickets.ts`): it needs a shared store
  before the API runs as more than one instance.

## Automated evidence

| Check | Result |
|---|---|
| `apps/api/src/socket-tickets.test.ts`: random opaque tickets, single use, 30 s expiry (including clock rollback), sweep | pass |
| `apps/api/src/ramble-ticket.test.ts`: bearer mints `no-store` ticket; cookies, revoked bearer, and bearer+cookie mixes are refused; verify never sees cookies | pass |
| `apps/api/scripts/verify-websocket.ts` (real Bun sockets): previous browser/origin checks plus ticket socket opens without cookie, runs the normal protocol, reuse refused, unknown ticket refused, consumed ticket + valid cookie/origin refused | pass |
| `packages/ramble/src/audio.test.ts`: 48 kHz to 16 kHz PCM16 conversion, uneven quanta, ordered queue, resource release, new interruption/disconnect cases | pass |
| `apps/client/src/ramble.test.ts`: provider starts only after microphone; frames 1–4 arrive in capture order across the ready boundary; partial→final; stop keeps socket for last phrase; permission denied; microphone interruption; backgrounding; socket loss; server/ticket errors | pass |
| `apps/client/src-tauri/src/ramble.rs`: socket URL derivation (http→ws, https→wss), malformed ticket rejection | pass |
| Root `bun run test` (41 files, 383 tests), `bun run typecheck`, `bun run build`; `cargo fmt --check`, `cargo test --locked`, `cargo check --locked --target aarch64-apple-ios-sim` | pass |

## End-to-end against the disposable QA API

`QA_API_PORT=3019 bun --no-env-file scripts/auth-smoke-server.ts` (in-memory auth plus a fake transcription
provider that reports the audio it actually received; port 3009 was occupied by another agent), then
`QA_API_PORT=3019 bun --no-env-file scripts/ramble-smoke.ts`:

- Signed in with the seeded QA account, minted a ticket with the bearer, opened the socket with
  `Origin: tauri://localhost`, and streamed 2 s of a 48 kHz 440 Hz tone through the shared encoder in
  128-sample quanta. Received the final transcription
  `QA transcription: 2.0 s of 16 kHz PCM16 in 20 frames, peak 50%`. Converted length, frame count and level
  were all exact.
- The same capture over the browser path (cookie + `Origin: http://localhost:5173`) produced the same text.
- Ticket reuse, unknown tickets, cookie-minted tickets, cookie without Origin and an untrusted Origin
  were all refused.

Browser client (`/ramble` through Vite `ws: true` proxy, headless Chromium):

- Denied permission → "Microphone access is off. Allow todalo to use the microphone…", with a **Try again** button.
- Hidden page while starting → "Recording stopped when todalo left the foreground…", discard sent,
  and the retry starts again.
- Microphone never delivered (getUserMedia pending) → after 30 s "Recording could not start in time…".
  The socket sent `discard` and closed.

Apple builds:

- `TODALO_API_BASE_URL=http://127.0.0.1:3019 bun tauri build --debug --bundles app --ci`: the bundle's
  `Info.plist` contains `NSMicrophoneUsageDescription`, and the bundle id is `app.todalo.client`.
- `TAURI_TODALO_API_BASE_URL=http://127.0.0.1:3019 bun tauri ios build --debug --target aarch64-sim --ci`
  built. The iOS bundle contains `NSMicrophoneUsageDescription`. The app launched on iPhone 17 Pro
  (265B8EC3…) to the sign-in screen.

## Unverified (needs a person)

- **Live microphone capture in WKWebView (Mac or iOS) and the OS permission prompts.** Driving the Mac
  app was declined. In the simulator, the hardware-keyboard layout turns `@`/`-` into other characters,
  so the QA sign-in could not be typed. Headless Chromium on this Mac never settles `getUserMedia`
  because that binary has no macOS microphone permission. Manual steps:
  1. `QA_API_PORT=3009 bun --no-env-file scripts/auth-smoke-server.ts` and build as above.
  2. Sign in as `existing@example.test`, open Ramble from the sidebar, press **Start recording**, and allow the prompt.
  3. Expect "Listening" and a rising `QA transcription: … s … frames` line. Press **Stop**; a final line appears.
  4. Repeat with the permission denied (iOS: Settings › todalo; Mac: System Settings › Privacy & Security ›
     Microphone). Expect the permission message. Background the app while listening; expect the
     foreground message.
- **Real transcription.** The QA server uses a fake provider by default. Set
  `RAMBLE_STT_PROVIDER=local` and `RAMBLE_STT_URL` (loopback whisper server) to use the real
  `connectSpeech` path. Fish/ElevenLabs keys were not used.
- **Physical iPhone**, signed Mac (hardened runtime needs the `com.apple.security.device.audio-input`
  entitlement), production `wss://` origin in the CSP (currently only `ws://127.0.0.1:*`/`ws://localhost:*`
  for loopback development) and the multi-instance ticket store all remain open. Tickets 23 and 25 own them.
