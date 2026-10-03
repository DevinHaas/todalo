# Ramble: speech understanding and Todoist's implementation

Researched on 3 October 2026. This report responds to the request to distinguish conversational speech from actionable tasks and to reconsider the initial phrase-based interpreter.

## What Todoist actually uses

Doist CTO Gonçalo Silva describes Ramble's production architecture in a [Google Cloud technical account published on 6 May 2026](https://cloud.google.com/blog/topics/startups/the-blueprint-doist-stream-of-consciousness-ai-task-list-creation). Raw PCM audio goes directly to Gemini Flash through the Live API. Speech recognition, language detection, and semantic understanding happen together; the model invokes task creation, editing, and deletion tools while the user speaks. A separate transcription stage is not required. Doist maintains a provider abstraction and evaluates semantic outcomes across recorded multilingual scenarios.

The [January launch announcement issued by Doist](https://www.prnewswire.com/news-releases/introducing-todoist-ramble-ai-that-turns-natural-speech-into-structured-tasks-302666143.html) names Gemini 2.5 Flash Live via Vertex AI. That is evidence of the model used at launch, not a promise that the exact deployed version is unchanged today. The later technical account identifies the Flash family without pinning a current model version.

Todoist's [current help article](https://www.todoist.com/help/todoist/todoist-and-ai/dictate-to-add-tasks-with-ramble-P1Raq7vVF) describes contextual task capture, corrections, and removals during speech. It advises users to state tasks clearly. Even a semantic model needs realistic product expectations and quality evaluation.

## Why transcription and phrase matching are insufficient

Todalo currently streams PCM to ElevenLabs Scribe v2 Realtime. Finalized transcript segments go through `interpretSegment`, which recognizes explicit commands and otherwise creates a task from the segment. This is reliable for the narrow command grammar, but it does not determine whether the user actually expressed an actionable intention.

Speech activity detection answers whether there is speech or silence. Transcription answers what words were spoken. Semantic interpretation answers whether those words imply a task, modify a previous task, remove one, or simply provide context. A faster transcription model alone does not supply that last capability.

Examples for evaluation:

| Spoken input | Desired result |
| --- | --- |
| “I'm just thinking about what I need to do.” | No task |
| “I need to call Anna tomorrow.” | Stage one task: Call Anna, tomorrow |
| “Actually, make that Friday.” | Edit the previous task's date; no extra task |
| “Don't add that; I already did it.” | Remove or omit the referenced task |
| “Buy milk and send the invoice tomorrow.” | Stage two distinct tasks |
| “The report is done, but I need to send it.” | Stage Send the report; do not treat the word done as a save command |
| “I've got a lot going on. First, book the dentist.” | Ignore the preamble and stage Book the dentist |
| “Put the invoice task in Work.” | Update the referenced task using an existing, authorized project |

These are proposed acceptance cases, not behavior already implemented by the current interpreter.

## Recommended next architecture

Use a low-latency native audio model with structured tool calls, starting with Gemini Live as the evidence-backed candidate. Google's [Live API overview](https://ai.google.dev/gemini-api/docs/live-api) documents server-proxied WebSockets and 16-bit, little-endian PCM at 16 kHz. Todalo already captures this audio format and has an authenticated server connection, so these boundaries can be retained.

The proposed flow is:

1. The browser captures audio and sends it to Todalo's authenticated Ramble connection.
2. A server-only provider adapter streams the audio to the live semantic model.
3. The model proposes structured operations: create a staged task, edit a staged task, remove one, change capture mode, or ignore speech.
4. Todalo validates each operation against the authenticated user's projects, staged task IDs, task schema, date/time rules, and single-level subtask constraint.
5. The interface updates staged tasks. Saving still uses the existing controlled commit path.

Model interpretation replaces the general speech-to-task decision. Deterministic code continues to own authorization, validation, undo history, task hierarchy, resource cleanup, and persistence. The model must not directly write to the database or choose arbitrary user/project IDs.

Google's [Live tool-use documentation](https://ai.google.dev/gemini-api/docs/live-api/tools) confirms function calling and explicit tool responses. The server must acknowledge accepted and rejected proposals so the model's context stays consistent with the displayed staged list. Manual removals also need to be reflected in that context.

An alternative is to keep ElevenLabs and add a small text model after transcription. That reduces audio-provider changes but adds another serial processing step and still depends on transcript segmentation. It should be compared in a measured prototype rather than assumed to be faster.

## What remains uncertain

- No primary source reviewed discloses model parameter counts, Todoist's exact prompts, complete tool schemas, or end-to-end latency percentiles.
- “Small” is not a verified property of Todoist's model. Low measured latency and correct semantic task capture are the useful selection criteria.
- Today's supported model IDs, regional availability, provider retention terms, and pricing need checking against the chosen account before integration.
- Todalo has an ElevenLabs credential configured, but no Gemini API key was found in the local environment. Google OAuth login credentials do not provide Gemini inference access.

The semantic provider has not been changed as part of this research/UI refinement. The current preview still uses ElevenLabs plus the original interpreter.

## Evaluation before switching providers

Use a small recorded corpus containing clear tasks, filler, multiple tasks in one breath, corrections, cancellations, references to earlier tasks, project names, interruptions, and the languages the product intends to support. Evaluate the resulting task list and edits, not transcript word accuracy alone.

Measure time to the first visible task, time from a correction to the updated card, missed tasks, spurious tasks, duplicates, incorrect edits, and cost per minute. Compare native audio and transcription-plus-text alternatives using the same recordings. Candidate latency targets should be set from those measurements; the sources above do not establish a numerical target for Todalo.

## UI refinement completed alongside this research

- The sidebar waveform button sits beside Add task.
- Opening Ramble starts microphone acquisition automatically once its authenticated connection opens.
- The modal retains the existing theme with compact header controls, microphone selection behind a dropdown, one example, and icon actions for discard/save.
- Microphone permission, errors, pause/resume, and staged-task review remain explicit and accessible.

Validation: the real local browser reached Listening automatically on open, pause changed the visible state, and the microphone menu listed available input devices. The modal was checked at desktop size and 390 × 844. Closing the trial discarded its staged tasks. A browser geometry check confirmed that the sidebar buttons share a row and Ramble is to the right of Add task. All 183 existing tests, type checks in all five workspaces, focused lint, and the design detector passed.
