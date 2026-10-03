# Ramble validation — 3 October 2026

Implemented all nine tickets locally: Turborepo workspaces, shared database/auth,
pure transcript grammar, Elysia authentication, the sub-task schema, server-side
ElevenLabs audio transport and staging, reused quick-add parsing, the modal and
entry points, and explicit batch commit/discard. Nothing was pushed or deployed.

## Automated and database checks

- `bun run test`: **183 tests in 9 files passed**, including the original 113
  quick-add/recurrence tests, 40 interpreter tests, 7 parent validation tests,
  9 audio/resource tests and 14 API session/provider/commit tests.
- `bun run typecheck`: all five workspaces passed.
- `bun run test:integration`: actual Bun/Elysia HTTP and WebSocket checks passed.
  These verify session-cookie authentication, missing-cookie and disallowed or
  missing-Origin rejection, binary transport with an injected speech provider,
  connection-local state, the four undo action types, single-level parenting,
  parent-card removal, spoken end, manual commit flushing, duplicate commit
  prevention, discard and invalid project/timezone rejection.
- `bun run build`: web and API production builds passed.
- The parent-column migration `0005_flimsy_ogun.sql` was applied to the configured
  database. A scoped live test verified parent lookup, deep-nesting rejection,
  and real `ON DELETE CASCADE`; its temporary user/tasks were removed.
- `git diff --check`: clean.
- Focused lint for the new Ramble UI/audio/project code, extracted pills,
  sidebar, quick-add and app layout passed. Full web lint reports three existing
  set-state-in-effect findings: two in the composer and one in `use-mobile`.
- Scanned all 23 generated browser JavaScript bundle files: zero occurrences of
  the configured ElevenLabs credential.

## Actual ElevenLabs speech and persistence

The opt-in `apps/api/scripts/verify-live-speech.ts` passed against the configured
provider and database, using the existing Test User login and a separate,
temporary local Elysia server. macOS generated known, non-sensitive QA speech;
the script streamed PCM16 at 16 kHz in real-time 100 ms frames through the same
authenticated socket protocol used by the browser, with pauses between phrases.

Actual finalized segments were:

1. `Ramble quality check tomorrow.`
2. `Subtask.`
3. `Check packing list tomorrow.`
4. `Top level.`
5. `Temporary quality check.`
6. `Remove last.`

The test confirmed the parent and child both received 4 October 2026 in
Europe/Zurich, entered/exited child capture, undid the temporary item, and wrote
zero tasks before explicit commit. Commit persisted exactly two rows with real
parent/child IDs, the staged titles, and the expected local due dates. Cleanup
removed only the uniquely scoped QA project/tasks and the script's auth session
and audio files. No production transcript-injection endpoint was added.

This test exposed ElevenLabs' `Subtask.` spelling; the grammar now accepts
`subtask` and `end subtask` as spelling variants, with regression coverage.

## Built-in browser walkthrough

Preview: `http://localhost:3000/upcoming`, using the existing authenticated
browser session. Verified:

- Existing Upcoming tasks, Today/Upcoming navigation and day-specific entries
  survive the migration. Upcoming still has no standalone quick-add field.
- Sidebar waveform opens Ramble and its WebSocket authenticates with the same
  existing Better Auth cookie. Start listening becomes enabled after connect.
- Ctrl+Shift+R opens Ramble when focus is outside an editable field.
- Sidebar Add task still opens the typed composer; its waveform opens Ramble.
- Tomorrow's Add task opens the composer seeded with Tomorrow; its waveform
  opens Ramble. The trigger passes its default due date to the session.
- Discard closes Ramble, including from those entry points, without saving.
- The modal exposes the microphone selector, staged-card area and save/discard
  controls. No provider key appears in its UI.
- Starting the browser microphone did not complete acquisition. The final
  30-second watchdog stops the attempt and displays: “Microphone permission has
  not completed. Allow microphone access in browser or system settings, then
  retry.” The provider starts only after microphone acquisition succeeds, so
  waiting for permission does not open an idle paid transcription connection.

Initial browser checks found an unavailable icon export and root-environment
loading too late for Next's worker initialization. Both were fixed; the final
preview loaded successfully with the existing login and task data.

## Remaining external checks and scope

Physical browser microphone capture, device switching with a live microphone,
and the full staged-card/save walkthrough using physical speech remain
unverified because the built-in browser's microphone request did not resolve.
The configured ElevenLabs key is valid: its real handshake and actual speech
transcription passed. The remaining mic check needs browser/system microphone
permission and a working input device.

No remote Coolify deployment or same-domain production path-routing check was
performed; deployment requires separate authorization. Dockerfiles and routing
instructions are provided, but container builds were not exercised because the
local Docker daemon is off. Parent hierarchy in the main list/board/calendar
remains out of scope, as specified; saved children are ordinary flat task rows.

The existing set-state-in-effect lint findings and custom recurrence label
limitation are outside this feature and remain unchanged.
