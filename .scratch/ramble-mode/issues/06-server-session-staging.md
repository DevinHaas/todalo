# 06 — Server-side Ramble session staging over the WebSocket

**What to build:** Each WebSocket connection from ticket 05 now holds live Ramble session state — the current mode (top-level/sub-task), the LIFO undo stack, and the list of staged (not-yet-saved) todos. Every finalized transcript segment is run through `interpretSegment` (ticket 02) against that state, and the resulting staged-list/mode/undo updates are streamed back to the client as structured messages. This is the point where "sub-task", "remove last", and "that's all" actually change session state, tested via a scripted WebSocket client sending text segments — no live mic needed for this ticket's verification.

**Blocked by:** 02, 05.

**Status:** ready-for-agent

- [ ] Each WebSocket connection maintains its own Ramble session state (mode, undo stack, staged todo list), scoped to that connection/session only
- [ ] Each incoming finalized transcript segment is passed through `interpretSegment`; the resulting action (create todo, create sub-task, enter/exit sub-task mode, undo, end session) updates the session state
- [ ] Updated staged-list/mode state is streamed back to the client after each segment is processed
- [ ] "That's all"/"stop"/"done" marks the session as ready to end (commit happens in ticket 09, not here) without closing the connection prematurely
- [ ] Verified with a scripted WebSocket test client sending a sequence of text segments (simulating speech) that exercises: top-level capture, entering/exiting sub-task mode, undo of each action type, and session end — producing the expected staged-list state at each step
