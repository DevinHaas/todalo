# 09 — Commit staged todos to the task list; Ramble entry points

**What to build:** The end-to-end feature. "Add tasks" (or the "that's all"/"stop"/"done" voice command) commits every staged todo — with `parentId` correctly set for sub-tasks — to Postgres in one go; nothing is written before this point (ADR `0005-ramble-stage-then-commit`). "Discard" ends the session without writing anything. Ramble becomes reachable: a waveform icon in `TaskQuickAdd` and in the sidebar, plus an in-app keyboard shortcut, all open the modal. This is the ticket where a user can go mic-to-task-list in one flow.

**Blocked by:** 04, 08.

**Status:** ready-for-agent

- [ ] "Add tasks" button and the "that's all"/"stop"/"done" voice command both commit the full staged list to Postgres as real tasks, sub-tasks correctly linked via `parentId`
- [ ] Nothing is written to Postgres before commit — closing the modal or clicking "Discard" at any point before commit leaves the task list unchanged
- [ ] "Discard" button ends the session and closes the modal without writing anything
- [ ] Waveform icon added to `TaskQuickAdd` opens the Ramble modal
- [ ] Waveform icon added to the sidebar opens the Ramble modal
- [ ] In-app keyboard shortcut (app focused, no mic/OS-level permissions required) opens the Ramble modal
- [ ] Manually verified end-to-end (`/verify`): open Ramble via icon and via shortcut, speak several top-level todos and at least one sub-task with a spoken due date, use "remove last" to undo one item, click "Add tasks", and confirm the committed tasks (including parent/child linkage and due date) appear correctly in the real task list
