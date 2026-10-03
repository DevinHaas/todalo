# Ramble mode

The authenticated app opens Ramble from the sidebar waveform, quick-add waveform,
day-specific composer waveform, or **Cmd/Ctrl + Shift + R**. Opening Ramble starts
the microphone automatically, subject to browser permission. Speak naturally;
the LLM separates actionable tasks from filler and supports contextual edits
and deletions. Capture-mode and save commands must occupy a whole spoken segment:

- `sub-task` / `sub task` / `subtask`: capture children under the last top-level task.
- `end sub-task` / `end subtask` / `back to` / `top level`: return to top-level capture.
- `remove last` / `undo` / `scratch that`: undo the last capture or mode change.
- `that's all` / `stop` / `done`: save all captured tasks.

Cards show the recognized date, time, recurrence and selected project. Removing a
parent card also removes its staged children. **Add tasks** saves the entire batch;
**Discard**, Escape, or closing before save abandons it. In-progress captures live
only in the socket's memory and are lost if the connection drops. No task is
written before an explicit save. A failed save keeps cards available to retry.

The modal shows staged tasks rather than the speech transcript. Its listening
indicator uses a smooth CSS animation, with a static reduced-motion alternative.
Microphone permission, worklet loading and the authenticated socket start in
parallel. A bounded initial-audio queue preserves the first words until the speech
provider is ready; device enumeration refreshes in the background. The semantic
provider is checked locally for configuration at start but receives no inference
request until finalized speech arrives.

## Local development

Run `bun install`, `bun run db:migrate`, then `bun run dev` from the repository
root. The root `.env` configures the web app and API. Set `DATABASE_URL`,
`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL=http://localhost:3000`, and
`FISH_API_KEY` and `GEMINI_API_KEY`. The API runs on port 3001 and Next on port 3000.

Only the API uses the speech and LLM credentials. The browser sends mono PCM16 audio at
16 kHz to `/api/ramble/ws`; the API authenticates the Better Auth cookie and checks
the browser Origin before upgrading. Fish receives bounded WAV utterances after
one second of silence (25-second maximum clips); it does not stream partial text.
For ElevenLabs realtime, set `RAMBLE_STT_PROVIDER=elevenlabs` and `ELEVENLABS_API_KEY`.
Partial transcripts are hints; each
finalized task segment passes through a serialized text LLM request. Exact standalone
mode/undo/end commands use the existing protocol directly to remain reliable and save
inference requests. Its structured
operations are validated and applied atomically to staged state. The server applies the user's
smart date recognition setting, and uses the browser's IANA timezone for saved
dates, including future daylight-saving changes.

The default is official Google `gemini-3.5-flash-lite`, minimal thinking, schema-constrained JSON output.
No additional LLM SDK or GPU server is needed for hosted inference. Restart
the dev service after changing credentials. Missing model configuration is
reported before opening the speech provider; there is no phrase-rule fallback.

For an existing compatible local server, set `RAMBLE_LLM_PROVIDER=compatible`,
`RAMBLE_LLM_BASE_URL=http://localhost:11434/v1`, and its actual
`RAMBLE_LLM_MODEL`. A remote server requires HTTPS and `RAMBLE_LLM_API_KEY`.
The server must support strict `response_format` JSON Schema and the configured
model. This does not install, download, or launch a local model.

For fully local inference on macOS, install `whisper-cpp` and `ollama` through
Homebrew, then run `bun run --filter @todalo/api local-models`. The explicit
setup downloads multilingual Whisper base (~148MB) and Qwen3.5 4B (~3.4GB)
to ignored `.local-models/` and starts loopback services. Runtime memory needs
exceed the weights' size. Set `RAMBLE_STT_PROVIDER=local`,
`RAMBLE_LLM_PROVIDER=ollama`, `RAMBLE_LLM_MODEL=qwen3.5:4b`; leave
`RAMBLE_LLM_BASE_URL` unset and restart development. These requests have no
provider usage fee. Whisper preserves the spoken language rather than translating
to English. Native Ollama disables thinking and requests the same JSON schema.
Local requests allow 60 seconds for initial model loading; warm latency must be
measured. Stop the setup process to stop services it launched.
For a local preview without changing `.env`, run `bun run --filter @todalo/api dev:local`
and `bun run dev:web` in separate terminals after model setup.

This local option runs on the machine hosting the API. For development that is
your Mac. A deployed web server cannot reach a visitor's local models through its
own loopback address; end-user desktop bridging is separate deployment work.
Selecting a local provider never falls back to a paid hosted service.

Only final speech is sent to the LLM, with at most the four previous short
segments, the latest 30 staged tasks, and 100 owned project names/IDs. Dates and
capture context are included; credentials, auth identity, and undo history are
excluded. The model receives text rather than audio. Each hosted request has a 10-second
deadline and a 4,096-token completion allowance (including reasoning), with
at most eight queued segments and 240 final segments before capture pauses.
Provider prices cover both input and billed output; speech costs are separate.

Failed understanding retains finalized speech for **Retry understanding** and
blocks save until it succeeds. Later finalized segments stay in order. Manual
save flushes transcription and waits for pending LLM work. Discard cancels the
model request and prevents late results from changing state. LLM edits and spoken
deletions can be undone; manual removals still cascade and prune stale history.
No task is written directly by the LLM.

`GET /api/ramble/health` is public. `GET /api/ramble/session` requires the same
session cookie as the web app and returns its current user ID.

## Deployment preparation

Build from the repository root. The main `Dockerfile` builds `apps/web`; its
entrypoint applies the shared migrations before starting Next. Build the separate
API with `apps/api/Dockerfile` and provide the same database and Better Auth
configuration plus its selected server-only speech and LLM keys.

Configure two Coolify applications on the same HTTPS domain. Route
`/api/ramble/*` to the API application on port 3001 and all remaining paths to the
web application on port 3000. The proxy must support WebSocket upgrades and allow
long-lived connections. Leave `RAMBLE_ALLOWED_ORIGINS` unset to use the origin of
`BETTER_AUTH_URL`, or set a comma-separated exact origin list. HTTPS is required
for microphone access outside localhost. Do not deploy the API on a different
domain without reviewing the cookie and origin configuration.

Deployment is prepared locally; no remote deployment is performed by development
checks. Validate the production path routing and microphone on the deployed
domain after deployment is separately authorized.

## Checks

`bun run test` runs parser, interpreter, session, audio and parent-validation
tests. `bun run typecheck` checks all workspaces; `bun run build` builds the web
and API. `bun run test:integration` exercises real local Bun WebSocket upgrades,
authentication/origin rejection, staging, undo and explicit save through
injected speech and semantic fixtures. It does not create a production transcript
bypass or establish live model accuracy.

`bun run --filter @todalo/api test:live-llm` is an opt-in, billable evaluation of
18 synthetic text scenarios: filler, multiple tasks, contextual correction,
cancellation, completed activities, dates, projects, English/German/French/Italian,
quoted commands, instruction attacks, changed reference dates, disabled smart dates,
recurrence and title correction. It prints pass counts, p50/p95 request
latency, billed token use (including Gemini thoughts), and estimated Gemini/Groq inference cost. No microphone,
database, private tasks, or identity is accessed. The default 15-second interval
helps with free-plan rate limits; adjust `RAMBLE_EVAL_INTERVAL_MS` for the actual
account quota. Provider failures are reported, not counted as successful cases.
Use the same corpus when evaluating the local model against Gemini.

On macOS, `bun run --filter @todalo/api test:live-speech` is an opt-in live
integration check. It generates non-sensitive QA speech with the system voice,
streams it through the configured transcription and task models and real authentication, saves
an isolated batch, verifies database linkage and dates, and removes that run's
QA project/tasks/session. It uses the configured speech account and incurs its
normal transcription usage. It requires the seeded Test User or the configured
`TEST_USER_EMAIL` / `TEST_USER_PASSWORD`, and does not validate a physical mic.

Hosted speech requires valid selected speech and LLM accounts/keys; local speech
requires running model services. Browser capture requires microphone
permission and an available microphone. See the dated QA record for actual local
verification results and limits.

See [the model comparison](research/ramble-post-processing-models-2026-10-03.md)
for the dated pricing evidence, quality limitations, and hosting analysis.
