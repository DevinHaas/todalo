# 02 — `interpretSegment` pure function for Ramble's command grammar

**What to build:** The phrase-spotting logic that turns one finalized transcript segment into an action, independent of any WebSocket/audio/UI plumbing (see ADR `0003-ramble-phrase-spotting-not-llm`). Given a segment's text and the current session state (mode: top-level or sub-task; a LIFO undo stack of prior actions), it recognizes the fixed trigger phrases — `sub-task`/`sub task`, `end sub-task`/`back to`/`top level`, `remove last`/`undo`/`scratch that`, `that's all`/`stop`/`done` — before falling back to treating the segment as a todo title. "Remove last" pops the most recent action off the stack and reverts it (create top-level todo / create sub-task / enter sub-task mode / exit sub-task mode), scoped to the current session only. This ticket also introduces the repo's first test runner (vitest), since none exists yet.

**Blocked by:** None — can start immediately, runs in parallel with ticket 01.

**Status:** ready-for-agent

- [ ] Vitest installed and configured (first test runner in the repo)
- [ ] `interpretSegment(text, sessionState) → { action, nextState }` implemented as a pure function with no I/O
- [ ] All trigger phrases recognized correctly, including case/whitespace variants
- [ ] Non-matching segment text falls through to a "create todo" (or "create sub-task", depending on current mode) action
- [ ] Undo stack correctly reverts each of the four action types; "remove last" with an empty stack is a no-op
- [ ] Mode transitions (enter/exit sub-task) are tracked in `nextState` and affect how subsequent segments are interpreted
- [ ] Unit tests cover the full grammar: each trigger phrase, mode transitions, undo popping the right action, and the todo-title fallback — no WebSocket, ElevenLabs, or Elysia involved
