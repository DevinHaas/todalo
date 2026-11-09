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

**Blocked by:** 22 (chat), 19 (drafts)

**Status:** needs-review

- [ ] Floating bar on all main views; focus shortcut in the registry; Esc closes the reply
- [ ] Chat reuses ticket 22's conversation and draft kinds; the sidebar chat stays or goes (decision)
- [ ] New draft change kinds: add sub-task, attach document, move, remove (in addition to add task)
- [ ] Per-change keep/drop plus Accept all and Decline all; stale check on accept
- [ ] Pending changes rendered in calendar, Today, lists and task detail (dashed, struck through)
- [ ] Session attachments: upload limits as task attachments (10 MB per batch); text extracted on the server (PDF, docx, text); images sent to models that support them
- [ ] Attached documents are kept with the session, and copied to a task only when an attach change is accepted
- [ ] Provider check: providers or models without file and image input get the extracted text only
- [ ] Tests at the API seam (route factory, fakes) and draft parser

Spec: ../spec.md. Vocabulary: CONTEXT.md.
