# 29: Coach bar with documents and visible changes

**What to build:** A floating bar at the bottom of the main view, available everywhere (shortcut to focus), replaces opening the Coach sidebar to talk to the Coach. The user types (or later speaks) questions and change requests ("move my run before work", "drop the admin block"). The bar shows:

- **Reply:** the Coach's short reply above the bar, like the reference ("I gave your sharpest mornings to…").
- **Pending changes:** a summary chip ("4 added, 1 moved, 1 removed") with Decline (×) and Accept (✓). Each change can also be kept or dropped on its own ("keep what fits").
- **Live preview:** the pending changes appear in the visible view while they wait. Added items show dashed in their goal colour, moved items dashed at the new time, and removed items struck through and hatched. On the calendar, Today, project lists and the task detail, new sub-tasks show as dashed rows and new attachments as dashed chips.

**Documents:** the user can attach files to the session (drag-drop, paste, or a paperclip): PDF, text/markdown, images, docx. The Coach can then:

1. Create tasks or sub-tasks from a document's contents ("turn this syllabus into tasks").
2. Attach the document to existing or new tasks, using the existing task attachments.
3. Use the document as context for its answers and plans.

Every effect is a draft change, shown and accepted like the others; nothing is written until accepted.

**Blocked by:** 22 (chat), 19 (drafts), 28

**Status:** done

- [x] Floating bar on all main views; focus shortcut in the registry; Esc closes the reply
- [x] Decision (2026-11-09): all interaction with the Coach (typing, replies, accept and decline) happens in the new bar. The sidebar stays as a read-only list: what the user asked for, and every task the pending change affects (added, moved, removed, sub-tasks, attachments), each linked to its task. The sidebar's chat input goes away; the conversation reuses ticket 22's chat and draft kinds
- [x] New draft change kinds: add sub-task, attach document, move, remove (in addition to add task)
- [x] Per-change keep/drop plus Accept all and Decline all; stale check on accept
- [x] Pending changes rendered in calendar, Today, lists and task detail (dashed, struck through)
- [x] Session attachments: upload limits as task attachments (10 MB per batch); text extracted on the server (PDF, docx, text); images sent to models that support them
- [x] Attached documents are kept with the session, and copied to a task only when an attach change is accepted
- [x] Provider check: providers or models without file and image input get the extracted text only
- [x] Tests at the API seam (route factory, fakes) and draft parser

Notes (2026-11-09): the bar is `coach-bar.tsx` (keys: o then a focuses it, o then f attaches; Esc closes the reply; o then k shows the read-only sidebar). Its × and ✓ decline or accept every pending change; Review opens the draft panel for keep/drop per change. Pending changes render through `pending-changes.tsx` (rows, Today, Inbox, the task sheet and page) and the calendar's draft blocks (removed: grey, dashed, hatched via the `bg-hatched` utility). New item kinds: `subtask` and `attach` (`coach_draft_items.parent_id`, `parent_item_id`, `document_id`, migration 0040, additive), plus chat "add" of a new task due on a day without a time. Documents are `coach_documents` (base64 like task attachments, text read once on upload: `coach-documents-text.ts`, PDF via the new `unpdf` dependency, docx unzipped with DecompressionStream), cleared with the chat, copied to `task_attachments` on accept. Images go to OpenAI, Anthropic and ChatGPT models; OpenRouter and Ollama get the text only. Mac: `upload_coach_documents`, `delete_coach_document`. QA: docs/qa/coach-bar/ (fake loopback model as the test user's Ollama provider).

Spec: ../spec.md. Vocabulary: CONTEXT.md.
