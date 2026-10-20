# 13. Organize tasks into sections and subtasks

Status: in-progress (code-complete; native commands on the iOS Simulator/Mac app, physical devices and the legacy web app against a database pending)
Type: task

**Blocked by:** 11.
    **What it delivers:** Users create/delete sections, move tasks between destinations and manage task parents from the shared interface.
    **Acceptance:** Preserve hierarchy and organization invariants, transaction behavior and ownership; verify destination lists, invalid cycles/cross-project relationships, sidebar/view invalidation and legacy compatibility. Provide touch-accessible actions in addition to desktop gestures.

## Comments

Published from the approved implementation proposal on 2026-10-04. Eligibility requires every listed blocker to be complete.

2026-10-15 — implemented. Evidence: `docs/qa/tauri-organization.md`; conventions:
`apps/client/README.md` ("Sections and sub-tasks").

Verified:
- Legacy organization actions moved to `@todalo/server/organization` (thin wrappers;
  `organization-actions.test.ts` passes unchanged). Sections: owner-scoped create
  (trimmed 1–200), delete (tasks stay unsectioned), destinations list.
- One task's move or parent change goes through `updateTask` via
  `PATCH /api/v1/tasks/:id` (`{ updatedAt, projectId, sectionId }` or
  `{ updatedAt, parentId }`): moved parents carry sub-tasks, a sub-task moved alone
  becomes a root, nesting joins the parent's project/section, one level only. Foreign or
  missing projects/sections/parents → 404; self-parent, depth and parents with
  sub-tasks → 400; stale copies → 412. Tests against the relational boundary and routes.
- Transaction behaviour unchanged from legacy (neon-http has no interactive
  transactions; the multi-statement legacy writes stay sequential, documented).
- Client: project page sections (create, collapse, delete), task-page Move / Nest /
  Unnest buttons (touch), cache invalidation of Today, tasks and projects; browser
  desktop and 390×844 runs. Rust body builders unit-tested.

Not verified: native commands in the iOS Simulator or Mac app, physical devices, the
legacy web app against a database, keyboard shortcuts (ticket 19), an Inbox list view.

2026-10-20 — Add task inside a project and per section (legacy ProjectView
`<TaskComposer projectId sectionId>`): every project group has a working composer
that creates in that project/section at the bottom, with an "Add at bottom / Add at
top" position toggle. Browser QA: a Doing draft landed last in Doing; Shift+A from a
focused root row added "Top QA" first in Tasks.
