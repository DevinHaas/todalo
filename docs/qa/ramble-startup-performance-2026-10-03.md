# Ramble startup and motion: 3 October 2026

## Changes

- Microphone acquisition starts when the modal mounts, alongside socket
  authentication. The audio worklet loads concurrently with device permission
  and AudioContext resume. Speech starts once both capture and the socket exist.
- The first PCM frames wait in an ordered queue, bounded to 256,000 bytes (eight
  seconds at 16kHz mono PCM16), until speech readiness. Overflow pauses capture
  with an error. Cancellation clears pending audio; it is never retained after
  discard. Microphone enumeration no longer delays the Listening state.
- Raw transcript rendering and transcript state updates were removed. The modal
  presents tasks, capture status, and errors.
- Nine staggered CSS transform animations replace the 10Hz audio-level-driven
  height updates. The worklet no longer computes or posts UI audio levels.
  Animation stops when paused and becomes static for reduced-motion preferences.
- No remote Fish/Gemini session is opened before speech: Fish uses clip uploads,
  and Gemini inference begins after a finalized utterance. The synchronous local
  model-configuration guard remains in place.

## Verification

The user explicitly authorized discarding the two cards in the disconnected
session before preview reload. No task was saved during this check.

Browser automation measured wall time from the launcher click to the visible
Pause listening control: **2,908ms before**, **1,452ms after**, and **1,348ms** in
a subsequent desktop check. These are indicative local checks with permission
already granted, not a controlled cold-start benchmark. They include automation
overhead; device startup, auth/database/cache conditions and permission prompts
can still affect real timings.

The initial global-stylesheet preview did not contain the new animation rules.
The final motion lives in a scoped CSS module. Fresh desktop inspection confirmed
nine active animations with distinct 0.74–1.08s durations, fixed 20px layout
height, and changing scale transforms. Pausing confirmed all nine animations
stopped. Desktop (1394×973) and mobile (390×844) screenshots were inspected;
the mobile dialog measured 358px wide with no horizontal overflow. The viewport
override was reset and capture was discarded. Reduced-motion behavior is defined
in CSS; OS preference switching was not simulated during this check.

- **219 tests across 13 files passed**, including ordered/bounded initial audio,
  parallel worklet loading, abort cleanup, and late microphone release after
  worklet failure.
- Frontend type checking, focused ESLint and production build passed.
- Authenticated WebSocket integration passed, including staging, hierarchy,
  flush/save ordering, undo and discard.
- The scoped design detector returned no findings; no suppression was added.

This pass changes microphone startup and presentation, not transcription or
semantic-model quality. Earlier hosted/local model validation remains applicable.
