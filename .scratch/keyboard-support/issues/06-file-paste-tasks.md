# 06: Paste files into project tasks with attachments

Type: task
Status: resolved
Blocked by: 02, 03

## What to build

Deliver documented project file-paste task creation with actual attachment storage and authenticated access/download. Preserve native paste in text fields, use clipboard file events without intercepting ordinary text, and integrate command availability/customization honestly.

## Acceptance criteria

- [x] Project paste-file default Cmd/Ctrl+V creates a task named after each file and attaches usable content.
- [x] Attachment creation/read enforce account and project ownership with appropriate size/type validation and visible retryable errors.
- [x] Text editing and native text paste remain usable; file paste is project/context scoped and respects effective binding disable/override behavior.
- [x] Meaningful attachment ownership/persistence/paste flow tests pass and required deployment/storage setup is documented.

## Context

[Canonical specification](../spec.md). Original research and reference are linked there. The implementation request approves all four stages; no further start confirmation is required.

## Comments

## Answer

Integrated `codex/keyboard-attachments` (`befca27`) with merge `ac4d48d`. Project file paste creates one named task and persisted attachment per file; authenticated upload/download/list routes validate account/task/project ownership, same-origin uploads, and bounded file batches. Task details expose usable attachment downloads. Native text paste remains available; disabled commands suppress file-task creation, while custom commands request browser clipboard access and report permission/API failures.

Verification: combined integration suite passes 21 files / 256 tests; full web/database typechecks pass; attachment route/component/library lint passes; diff check passes. [Attachment route tests](../../../apps/web/app/api/attachments/attachments.test.ts) cover ownership and request behavior; [paste flow tests](../../../apps/web/lib/project-file-paste.test.ts) cover native/custom/disabled/error behavior. Live browser verification remains assigned to [ticket 07](07-integration-verification.md) and [lead browser notes](/private/tmp/todalo-keyboard-browser-verification.md).

Deployment/browser limits: [storage documentation](../../../docs/agents/attachment-storage.md) records PostgreSQL base64 storage, transactional task/attachment creation, 5 files per paste / 5 MiB per file / 10 MiB total, backups/capacity needs, and the Clipboard API permission/security/browser constraints. Custom clipboard reads may expose images only and omit original filenames. Generated migrations 0008 (metadata milestone) and 0009 (attachments) are journaled and have now been applied by the lead alongside 0006–0007. Live browser file paste created a task and attachment; final download verification continues under ticket 07. Full metadata feature ticket 04 is now resolved.
