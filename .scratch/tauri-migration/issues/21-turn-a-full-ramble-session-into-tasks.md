# 21. Turn a full Ramble session into tasks

Status: code-complete (native and physical-device verification pending)
Type: task

**Blocked by:** 12, 13.
    **What it delivers:** Users record, review, revise and commit staged Ramble tasks into their selected project/parent context.
    **Acceptance:** Preserve staging/commit and semantic-processing ADRs, undo/review behavior and existing settings; make retries nonduplicating; recover from connection/audio interruption without claiming unsaved work succeeded; verify physical-device latency and cleanup. Reuse the feasibility audio path.

## Comments

Published from the approved implementation proposal on 2026-10-04. Eligibility requires every listed blocker to be complete.

Implemented on 2026-10-16 ([QA record](../../../docs/qa/tauri-ramble-commit.md)). Verified with unit/route
tests, real-socket integration and browser QA against the disposable QA API (fake transcription,
console-substituted audio device): staging, removal, socket save, HTTP save after a lost
connection, replay without duplicates (`QA_AMBIGUOUS_WRITES`), default date from the composer,
smart-dates off. `ramble_commit` compiles for the iOS simulator and is unit-tested. Pending: the
native app driven end to end, and physical-device microphone permission, latency and cleanup.
