# Ramble semantic layer and local providers: 3 October 2026

The hosted configuration is Fish file transcription plus official Gemini 3.5
Flash-Lite, with a separately selected fully local configuration: multilingual
Whisper base through whisper.cpp and native Ollama Qwen3.5 4B. Local inference
runs both services on loopback and has no provider usage charges. After hosted
verification, the running preview was switched to Fish and Gemini.

## Automated verification

- 214 unit tests across 12 files passed: shared parsing/application, model adapters,
  atomic edits/deletions, undo, project/parent validation, serialization, retry,
  commit ordering, discard cancellation, clip audio formatting and provider errors.
- All five workspace type checks passed. Local setup/evaluation scripts also pass
  a separate strict TypeScript check using Bun's types.
- Production web/API build passed; Google Fonts required network access.
- Authenticated Bun WebSocket integration passed: origin/auth rejection, binary
  audio, staging/hierarchy, undo, manual deletion, flush, single commit and discard.
- Focused frontend lint and diff whitespace checks passed. Existing unrelated
  project-wide lint failures recorded in the earlier QA report remain outside scope.

## Actual local inference

On the detected Apple M5 Pro, Qwen3.5 4B passed **18/18 synthetic text cases** after
prompt refinement: filler, multiple tasks, contextual date/title correction,
deletion, completed activities, quoted commands, instruction attacks, known/unknown
projects, English/German/French/Italian dates, a different reference date, disabled
date recognition and recurrence. Warm request p50 was **1,447ms**, p95 **2,260ms**.
No other local inference ran during that measurement. This corpus was used in
prompt development and is not an independent blind benchmark.

The initial older Qwen3 4B passed only 2/14 and was rejected; its unused downloaded
weights were removed. Initial Qwen3.5 failures led to date-only reference context,
a two-week weekday calendar, examples and explicit null/project/recurrence rules.

The actual local synthetic-speech flow passed real authentication, PCM phrase
segmentation, local Whisper transcription, local semantic task extraction, due
dates, subtask mode, undo, staging, explicit save and persisted parent linkage.
The run deleted only its uniquely named QA project/tasks/session afterward.
Standalone mode/undo/end phrases now follow exact protocol commands without
inference; ordinary task intent and contextual corrections always use the LLM.

Whisper base occasionally transcribed "Ramble" as "Rambl" and "Buy" as "Bye".
Synthetic speech does not establish physical microphone, noise, accent or Swiss
German accuracy. Clip providers use an energy gate for audio endpointing only;
quiet/noisy speech can require threshold or model tuning. No standalone streaming
Fish ASR endpoint was documented, so Fish and local Whisper emit phrase results
after a pause rather than streaming partial text.

## Hosted setup and verification

Google AI Studio's dedicated Todalo Ramble project and Gemini credential were
created following the user's explicit approval. The credential is stored only in
the ignored local `.env` with owner-only permissions. Browser-to-file transfer
used local encryption; credentials are not returned to the application browser.

The initial fast Gemini run passed 14 text cases; four later requests hit HTTP429
on the new free-tier project. The full rerun with 15 seconds between requests
passed **18/18**, with p50 **956ms**, p95 **1,299ms**, 26,464 input tokens and
1,026 billed output tokens including thoughts. The paid-price estimate for this
entire evaluation was **$0.010504**; this does not mean free-tier calls incurred charges.

Fish sign-in/terms and a dedicated Todalo Ramble credential were separately
approved by the user. The key was created with a 90-day lifetime and saved in
the ignored local `.env`. Automatic approval review initially blocked opening
its key flow until that specific approval arrived; the block is resolved.
Initially the developer account showed $0 balance and two synthetic Fish requests
returned HTTP402. After the user reported completing the top-up, refreshing API
Billing showed **$5 credit**, with auto-recharge still off. The agent did not
submit a payment. Two subsequent authenticated synthetic-speech integration runs
using **Fish + Gemini passed**, including date extraction, subtask/top-level
commands, undo, staging, explicit save, persisted parent linkage and scoped cleanup.

The first successful run exposed Fish Pro's inline `<|speaker:N|>` metadata.
The adapter now strips only those numeric speaker markers before display and
interpretation, disables emotion/audio-event tags with `tag_audio_events=false`,
and skips metadata-only output. A focused regression check preserves bracketed
spoken content. The second live run confirmed clean transcripts and the complete
flow. Updated unit tests, API type check and API production build all passed.

The preview now uses hosted models. `dev:local` explicitly selects local providers and
does not silently fall back to a paid service. On a deployed server, loopback
refers to that server rather than a visitor's computer; end-user local inference
needs a separate desktop bridge before production support can be claimed.

Automatic approval review previously blocked the stale preview tab's `data:`
error page. The user subsequently reopened the app in a new tab. In that tab,
the inline task composer showed its Ramble waveform; opening Ramble automatically
reached **Listening** and captured real microphone speech with the local providers.
Discard then stopped capture without saving tasks. This confirms basic microphone
and UI readiness, not noise, accent, dialect or hosted microphone accuracy. The
hosted integration uses synthetic speech; broader microphone quality remains untested.

The reported side-tab accent border was removed from the Ramble modal. No design
ignore was persisted, and no part of that finding was left standing.
