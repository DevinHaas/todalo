Status: ready-for-agent

# Ramble mode

## Problem Statement

Capturing several todos at once means opening the composer, typing, submitting, and repeating — for a burst of "for the trip: book flights, renew passport, buy adapter"-style thinking, that's a lot of friction per item, and there's no way to capture a todo with its sub-todos hands-free while thinking out loud.

## Solution

A voice-driven capture modal ("Ramble," named and modeled after Todoist's real feature — see https://www.todoist.com/help/articles/dictate-to-add-tasks-with-ramble-P1Raq7vVF) where speech is transcribed in real time via ElevenLabs STT and segmented into todos as you talk. Unlike Todoist's LLM-driven version, this uses fixed trigger phrases (not an LLM) to enter/exit sub-task capture and to undo the last captured item — see ADR `0003-ramble-phrase-spotting-not-llm` for why. Captured todos are staged in the modal and only written to the database when the session is explicitly confirmed.

## User Stories

1. As a user, I want to click a waveform icon in `TaskQuickAdd` or the sidebar to open the Ramble modal, so starting a session is one click from either surface.
2. As a user, I want an in-app keyboard shortcut to open the Ramble modal while the app is focused, so I don't need the mouse.
3. As a user, I want to speak freely and see todo cards appear live in the modal as I pause between items, so capture feels like thinking out loud, not filling out a form.
4. As a user, I want each todo card to show its recognized date and project (reusing the same pill styling as elsewhere in the app), so I can see what was captured without leaving the modal.
5. As a user, I want spoken date/time/recurrence language in a captured segment (e.g. "buy milk tomorrow") to set that todo's due date, so ramble mode benefits from the same natural-language parsing as typed quick-add.
6. As a user, I want to say "sub-task" to start capturing sub-todos nested under the last top-level todo, so I can voice a todo and its sub-items in one flow.
7. As a user, I want to say "end sub-task" (or "back to"/"top level") to return to capturing top-level todos, so I can alternate between top-level items and sub-items in one session.
8. As a user, I want to say "remove last" (or "undo"/"scratch that") to undo my most recent captured item or mode change, so a misspoken item doesn't force me to restart the whole session.
9. As a user, I want to be able to click a manual ✕ on any staged card to discard it, so a misheard item can be removed even if voice undo doesn't catch it.
10. As a user, I want to say "that's all" (or "stop"/"done") or click "Add tasks" to end the session and commit every staged todo to my task list, so ending is available by voice or by hand.
11. As a user, I want to click "Discard" to end the session without saving anything, so an abandoned or test session leaves nothing behind.
12. As a user, I want nothing written to my task list until I explicitly confirm the session, so an accidentally closed modal doesn't leave half-finished tasks lying around.
13. As a developer, I want the phrase-to-action interpretation to be a pure function independent of the WebSocket/audio pipeline, so the capture grammar can be tested without a live microphone or ElevenLabs connection.

## Implementation Decisions

- **Pipeline**: browser mic → WebSocket → Elysia server (new `apps/api`) → ElevenLabs real-time STT (server-side API key only, never sent to the browser) → transcript segments streamed back over the same WebSocket. See ADR `0004-elysia-monorepo-for-ramble-websocket` for why this isn't a Next.js Route Handler.
- **Segmentation**: one ElevenLabs-finalized (endpointing/pause-detected) transcript segment = one captured item, matching Todoist's own "pause between items" guidance.
- **Command interpretation**: each finalized segment's text is checked against fixed trigger phrases first (`sub-task`/`sub task`, `end sub-task`/`back to`/`top level`, `remove last`/`undo`/`scratch that`, `that's all`/`stop`/`done`) before being treated as a todo title. No LLM call — see ADR `0003`.
- **Undo model**: a LIFO stack of this session's capture actions (create top-level todo / create sub-task / enter sub-task mode / exit sub-task mode). "Remove last" pops one action and reverts it. Scope is this session only — cannot reach back into todos that existed before the session started.
- **Reused parsing**: each segment's text (once confirmed not to be a command) is run through the smart quick-add parser (`smart-quick-add` feature) to extract date/time/recurrence, same as typed input.
- **Staging**: captured todos are held in memory (client-side or tied to the WebSocket connection's session state) — nothing is written to Postgres until "Add tasks"/"that's all" commits the session. See ADR `0005-ramble-stage-then-commit`.
- **Data model**: `tasks.parentId` — a nullable, self-referencing column (`references tasks.id`, `onDelete: "cascade"`). Single-level nesting only; a sub-task cannot itself have sub-tasks. Rendering the parent/child hierarchy in list/board/calendar views is explicitly out of scope for this spec.
- **UI**: a `Dialog` modal titled "Ramble," mic/waveform indicator top-right (with a device-selector dropdown). Each staged card: title, recognized date pill, project pill (reusing existing pill components), manual ✕. No thumbs up/down (there's no LLM output to rate). Footer: "Discard" and "Add tasks" buttons.
- **Monorepo migration**: the repo becomes a Turborepo monorepo — `apps/web` (existing Next.js app, unchanged behavior), `apps/api` (new Elysia server, Bun-native — this repo already runs on Bun per `bun.lock`/`oven/bun`), `packages/db` (shared Drizzle schema/client), `packages/auth` (shared Better Auth setup so `apps/api` verifies the same session cookie `apps/web` issues). See ADR `0004`.
- **Deployment**: two separate Coolify applications on the same domain, path-routed (`/api/ramble/*` → Elysia), not split across subdomains — same domain means the Better Auth session cookie is readable by both without CORS/cross-origin cookie configuration.
- **ElevenLabs API key**: lives only in `apps/api`'s server-side environment, never referenced from `apps/web` or shipped to the browser.

## Testing Decisions

- Primary seam: `interpretSegment(text, sessionState) → { action, nextState }` — a pure function taking one finalized transcript segment and the current mode/stack, producing the action (create todo/sub-task, enter/exit sub-task mode, undo, end) and the updated state. Test the full command grammar here (trigger phrase matching, undo popping the right action, mode transitions) without a WebSocket, ElevenLabs, or Elysia involved.
- The smart quick-add parser reused inside this seam is tested independently as part of the `smart-quick-add` spec — don't re-test its grammar here, only that a segment's parsed fields land on the right staged card.
- Not unit tested: the WebSocket/Elysia/ElevenLabs plumbing itself — that's integration glue around the seam above; cover it manually per `/verify` (a real ramble session end-to-end) since it requires a live mic and network connection.

## Out of Scope

- Mirroring real Ramble's LLM-driven natural-language editing ("Actually, I meant…") — see ADR `0003`.
- Sub-task rendering in the main list/board/calendar views — the hierarchy exists in the data model and in the Ramble modal only.
- Sub-sub-tasks (nesting beyond one level).
- Global/OS-level "launch from anywhere" keyboard shortcut — not achievable from a browser tab; only an in-app shortcut is built.
- Server-side persistence of an in-progress (uncommitted) ramble session for recovery after a dropped connection.
- Targeted removal by name/number ("remove the second one").

## Further Notes

- Grounded in Todoist's Ramble marketing page and help article (fetched and indexed during grilling: `todoist-ramble-page`, `todoist-ramble-help`), specifically confirming that real Ramble does *not* support sub-tasks and is LLM-driven — both points where this spec deliberately diverges.
- Depends on the monorepo/Elysia migration landing first; `to-tickets` should express this as a blocking edge rather than bundling the migration and the feature into one ticket.
- See `CONTEXT.md` for the `Ramble session` and `Sub-task` glossary entries, and ADRs `0003`, `0004`, `0005`.
