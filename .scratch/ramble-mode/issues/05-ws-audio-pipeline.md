# 05 — WebSocket audio pipeline: mic → Elysia → ElevenLabs STT → transcript segments

**What to build:** The raw transport: audio streamed from a browser mic over a WebSocket to `apps/api`, forwarded to ElevenLabs real-time STT (server-side API key only), with finalized (endpointing/pause-detected) transcript segments streamed back over the same WebSocket as they become available — one finalized segment per captured item, matching Todoist's "pause between items" guidance. Authenticated using the session verification from ticket 03. No command interpretation or staging yet — this ticket proves audio in, text segments out, correctly attributed to the logged-in user's connection.

**Blocked by:** 03.

**Status:** ready-for-agent

- [ ] WebSocket endpoint on `apps/api` (under the `/api/ramble/*` path routed to Elysia) accepts an authenticated connection and rejects unauthenticated ones
- [ ] Browser-side mic capture streams audio to the WebSocket
- [ ] Server forwards the audio stream to ElevenLabs real-time STT
- [ ] Each ElevenLabs-finalized transcript segment is streamed back to the client over the same WebSocket as a discrete message
- [ ] Connection close/drop is handled without crashing the server (in-progress session state loss on drop is expected and out of scope per the spec — no recovery needed)
- [ ] Manually verified end-to-end with a real mic and network connection: speaking a few short phrases with pauses between them produces one finalized segment per phrase
