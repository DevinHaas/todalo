# 08 — Ramble modal UI: live staged cards over the WebSocket

**What to build:** The "Ramble" `Dialog` modal itself — a mic/waveform indicator with a device-selector dropdown top-right, connected to the WebSocket session from ticket 06, rendering staged todo cards live as segments come in. Each card shows title, recognized date pill, and project pill, plus a manual ✕ to discard that one card by hand. Footer has "Discard" and "Add tasks" buttons (wired for UI state in this ticket; actually committing/discarding against Postgres is ticket 09). Since no reusable date/project pill components exist yet in the codebase (date and project are currently rendered ad hoc in `task-row.tsx`), this ticket extracts small `DatePill`/`ProjectPill` components used by both the Ramble cards and `task-row.tsx`.

**Blocked by:** 06.

**Status:** ready-for-agent

- [ ] `Dialog` modal titled "Ramble" with mic/waveform indicator and device-selector dropdown
- [ ] Modal connects to the Ramble WebSocket session on open and closes the connection on close
- [ ] Staged todo cards render live as the server streams staged-list updates, showing title + date pill + project pill
- [ ] `DatePill`/`ProjectPill` extracted as small reusable components (from the ad hoc rendering in `task-row.tsx`) and used in both `task-row.tsx` and the Ramble cards, with no visual change to the existing task list
- [ ] Manual ✕ on a card removes it from the modal's displayed staged list
- [ ] Sub-task cards are visually distinguished as nested under their parent top-level card
- [ ] Footer "Discard" and "Add tasks" buttons are present and clickable (wiring to actually persist/discard lands in ticket 09)
