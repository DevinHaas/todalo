# 0006: Semantic transcript post-processing for Ramble

Status: Accepted, 3 October 2026.

The user requested an LLM post-processing layer after reviewing Todoist's native
audio approach. This supersedes the phrase-only task-intent decision in ADR 0003;
the existing deterministic quick-add parser and command implementation remain
shared validation/application primitives.

Use Fish file ASR with bounded utterance clips, or local multilingual Whisper;
retain ElevenLabs realtime as an explicitly configured alternative. Send finalized
segments to a configurable text inference provider and require bounded, strict
JSON operations for task creation, editing, deletion, mode changes, undo, and
ignoring non-actionable speech. The user selected official Gemini 3.5 Flash-Lite
with minimal thinking as the hosted default. Native loopback Ollama with Qwen3.5 4B
provides the local task interpreter. Both local providers must be selected explicitly;
there is no automatic hosted fallback. OpenAI-compatible serving remains available.
Exact standalone mode/undo/end phrases use the existing protocol semantics without
an inference request; ordinary speech, corrections and task intent still use the LLM.

Honor the user's selected default using current first-party API documentation. Published
decoder throughput is not request latency, and those evaluations are not a
substitute for Ramble-specific acceptance cases. A live synthetic evaluation
reports semantic correctness, measured latency, and billed tokens.

Serialize model decisions and manual state mutations within each authenticated
connection. Validate whole operation batches before applying them; allocate
staged IDs server-side and enforce project ownership, real dates/times, and
single-level parenting. Preserve corrections and deletions in undo history.
Only the existing explicit commit path writes to the database.

Bound context and completion budget, request only finalized segments, cancel
in-flight work on discard, and retain failed finalized speech for explicit retry.
Saving waits for the processing queue and refuses to omit failed speech. Missing
credentials fail clearly before paid transcription begins. Never fall back to
creating a task from arbitrary text after a model failure.

Tradeoffs: inference adds another service dependency and network step after
transcription. Context bounds limit references to older staged tasks. Model
outputs can be schema-valid yet semantically wrong; real task-specific evaluation
and user review remain necessary. Hosted inference avoids an idle GPU bill until
actual volume or data-locality requirements justify self-hosting. Fish has no
documented standalone streaming ASR API: phrase results appear after a pause and
upload. Energy endpointing is sensitive to noise/quiet voices. A local development
API's loopback reaches the developer's Mac; a deployed API's loopback reaches its
server, so end-user local inference needs a separately designed desktop bridge.

Evidence: [model comparison](../research/ramble-post-processing-models-2026-10-03.md).
