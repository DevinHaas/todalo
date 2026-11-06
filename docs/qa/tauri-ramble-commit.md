# Ticket 21 — Turn a full Ramble session into tasks

Date: 2026-10-16. Builds on [ticket 6](tauri-ramble.md) (capture, socket tickets) and ticket 10
(audio worklet CSP).

## Decisions

- **Legacy flow, ported as a screen.** `/ramble` reproduces `apps/web` `ramble-modal.tsx`: the
  microphone starts with the session; pause/resume; the wave indicator (static under reduced
  motion); staged cards with date, end time, repeat and project pills, sub-tasks nested; remove
  per card; "Capturing sub-tasks"; Retry understanding; **Add tasks** and Discard/Escape. A
  composer waveform opens `/ramble?date=YYYY-MM-DD` (legacy `defaultDueDate`). The server-side
  extraction, LLM operations, undo and spoken commands are unchanged (ADR 0005/0006).
- **Retry-safe commit.** The client generates one operation ID per session and sends it with
  `start`. Task IDs are `sha256(userId, operationId, stagedId)` formatted as UUIDs
  (`apps/api/src/commit-rows.ts`); the single INSERT skips rows that already exist. A socket
  `save_failed` retry and an HTTP replay are therefore the same operation, and another account
  can never address these rows.
- **Recovery without false success.** The socket holds the batch (ADR 0005). If it closes while a
  save is in flight, the client replays the last published batch over
  `POST /api/v1/ramble/commit` (cookie + Origin guard, or bearer via native `ramble_commit`).
  If it closes before a save, the cards stay with "not added yet" copy and **Add tasks** uses the
  same HTTP save; speech that was still being understood is reported as lost. Success appears only
  after `committed` or a 200; other failures show "could not be confirmed" and keep the cards.
- **Interruptions** (backgrounding, microphone loss, audio-session interruption) stop capture
  but keep the socket and cards; Resume continues the same session. Leaving the screen discards.
- **Destinations.** Legacy assigns projects from speech (owned project list); it has no section
  assignment, so none was added. The commit refuses projects the user does not own (404) and
  invalid parents/dates (400). Parents must be in the batch, one level deep.
- **Smart dates.** The server applies the account setting (QA service now reads its settings map
  and owned projects like `production.ts`); the client also sends `smartRecognition` as legacy did.
- The QA service's Ramble block already used `clientOrigin`; its commit is now a memory copy of
  `commit.ts` on the shared `prepareTaskRows`, and `QA_AMBIGUOUS_WRITES` drops the first answer of
  each Ramble commit.

## Automated evidence

| Check | Result |
|---|---|
| `apps/api/src/commit.test.ts`: row rules, deterministic per-user/per-operation IDs, strict HTTP input | pass |
| `apps/api/src/ramble-commit-route.test.ts`: replay writes once; foreign project 404; bad parent/title/DST/extra field 400; bearer vs cookie+Origin (401/403); two users' identical operations stay separate | pass |
| `apps/api/src/ramble-session.test.ts`: socket save uses the client operation ID; a retry after `save_failed` reuses it; invalid IDs refused | pass |
| `apps/api/scripts/verify-websocket.ts` (real Bun sockets) | pass |
| `apps/client/src/ramble.test.ts`: provider after microphone with operation ID; staged review, remove, socket save confirmed only by `committed`; lost answer replayed over HTTP with the same ID; lost connection keeps cards, unconfirmed HTTP save keeps cards and retries with the same ID; lost speech message; pause/resume in one session; interruption/backgrounding keep the session; permission denied; understanding retry; discard vs save in flight; HTTP status mapping | pass |
| `src-tauri/src/ramble.rs`: typed commit body drops unknown fields; invalid operation/time zone/empty batch refused | pass |
| `cargo check --locked --target aarch64-apple-ios-sim`, `cargo fmt --check`, `cargo test --locked` | pass |

## Browser QA (disposable QA API, fake transcription)

`QA_API_PORT=3121 QA_CLIENT_ORIGIN=http://t21.localhost:5221 bun --no-env-file scripts/auth-smoke-server.ts`
and Vite on 5221 (`CLIENT_API_PROXY_TARGET`). The browser pane has no audio clock, so for QA the page's
`AudioContext`/`AudioWorkletNode`/`getUserMedia` were replaced from the console with a stand-in posting
100 ms PCM16 tone frames (the encoder itself is unit-tested). Everything after capture is real:
socket, fake speech, fixture semantic processor, quick-add parser, commit.

- Two phrases staged as two cards ([desktop-01-staged.jpg](tauri-ramble-commit/desktop-01-staged.jpg)); remove dropped one.
- Socket closed from the console: the card stayed with the "not added yet" message
  ([desktop-02](tauri-ramble-commit/desktop-02-connection-lost-tasks-kept.jpg)); **Add tasks** saved
  it over `POST /api/v1/ramble/commit` (200) and returned to Today.
- Connected **Add tasks** saved over the socket (`committed`, count 1) and returned to Today.
- Composer waveform opened `/ramble?date=2026-10-16`; the card showed "16 Oct" and landed in Today.
- With smart dates on, the fake text "1.9 s …" became a 1 Sep date (shared parser); after
  `PATCH /api/v1/settings` to off, titles kept their numbers and got no date.
- `QA_AMBIGUOUS_WRITES=1`: first socket save applied but answered `save_failed`; the second
  **Add tasks** succeeded and Today showed exactly one copy.
- Socket closed right after the `commit` message: one HTTP replay, one task in Today.
- Manual HTTP replay of a two-task batch with a sub-task: 200 twice, two rows, child linked to the
  derived parent ID, 16:00 Zurich stored as 14:00Z; a batch into another user's project → 404.
- 390×844: no horizontal scroll ([mobile-390-listening.jpg](tauri-ramble-commit/mobile-390-listening.jpg)).
- A backgrounded tab stopped capture on open ("left the foreground"); Resume continued.

## Unverified (needs a person)

- Native end to end (Mac app or simulator): `ramble_commit` compiles for iOS simulator and is
  unit-tested, but was not driven in a running app. Simulator microphones are a mock device (no OS
  prompt), so microphone permission, real capture latency and cleanup still need a **physical
  iPhone and Mac** — pending, as for ticket 6.
- Real transcription/LLM providers (fake transcription and fixture semantics only; no keys used).
- Device selection (legacy microphone menu) was not ported: WKWebView offers no useful choice on
  iPhone; add it if the Mac app needs it.
