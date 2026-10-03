# 07 — Wire smart quick-add parsing into segment interpretation

**What to build:** Once a segment has been confirmed not to be a command (ticket 02), run its text through the `smart-quick-add` natural-language parser to extract due date/time/recurrence before it's staged as a todo — the same parsing typed quick-add uses, so "buy milk tomorrow" staged from Ramble gets a due date exactly as it would from the composer.

**Blocked by:** 02, and externally by the `smart-quick-add` spec (`.scratch/smart-quick-add/spec.md`) being implemented and merged — that feature does not exist in the codebase yet and is out of scope for this ticket set. This ticket cannot be picked up by an agent until a `smart-quick-add` parser module exists to import.

**Status:** ready-for-agent

- [ ] The non-command branch of segment interpretation calls the `smart-quick-add` parser on the segment text
- [ ] Recognized date/time/recurrence fields land on the staged todo (or staged sub-task) produced from that segment
- [ ] The matched phrase is stripped from the staged title, consistent with how typed quick-add treats a matched phrase
- [ ] No re-testing of the parser's own grammar here (that's covered by the `smart-quick-add` spec's own tests) — tests here only confirm a parsed segment's fields land on the correct staged card
