# 06: Paste files into project tasks with attachments

Type: task
Status: open
Blocked by: 02, 03

## What to build

Deliver documented project file-paste task creation with actual attachment storage and authenticated access/download. Preserve native paste in text fields, use clipboard file events without intercepting ordinary text, and integrate command availability/customization honestly.

## Acceptance criteria

- [ ] Project paste-file default Cmd/Ctrl+V creates a task named after each file and attaches usable content.
- [ ] Attachment creation/read enforce account and project ownership with appropriate size/type validation and visible retryable errors.
- [ ] Text editing and native text paste remain usable; file paste is project/context scoped and respects effective binding disable/override behavior.
- [ ] Meaningful attachment ownership/persistence/paste flow tests pass and required deployment/storage setup is documented.

## Context

[Canonical specification](../spec.md). Original research and reference are linked there. The implementation request approves all four stages; no further start confirmation is required.

## Comments

