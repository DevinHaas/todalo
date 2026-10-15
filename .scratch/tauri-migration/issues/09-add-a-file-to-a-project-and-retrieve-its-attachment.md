# 9. Add a file to a project and retrieve its attachment

Status: in-progress (code-complete; Mac and iPhone app UI checks pending)
Type: task

**Blocked by:** 8.
   **What it delivers:** A user creates a file-backed task in a project and opens/downloads its attachment from browser, iPhone and Mac.
   **Acceptance:** Preserve stored bytes, metadata, upload limits and task ownership; prove native authenticated upload/download, cancellation and errors without disabling existing protections; validate iPhone file selection and Mac paste/drag/drop. Include relaunch and existing-attachment compatibility checks.

## Comments

Published from the approved implementation proposal on 2026-10-04. Eligibility requires every listed blocker to be complete.

2026-10-15: File tasks, attachment listing and downloads now run through `/api/v1` on the shared `@todalo/server/attachments` operations (the legacy Next routes call the same code; storage is still the `task_attachments` row). The shared client adds "Add files", paste and drop on a project and an Attachments list on the task. Native builds use three fixed commands: uploads cross IPC as one raw body that Rust re-validates and frames as multipart, and downloads are fetched in Rust with the Keychain bearer and saved to Downloads (Mac) or Files › On My iPhone › todalo, so the token never reaches the webview or a URL. In Chromium against the isolated QA API: picker, paste and drop created file tasks; a download matched the original SHA-256; a seeded legacy-format attachment downloaded unchanged; foreign IDs got the same 404 as missing ones; oversized files and an interrupted upload showed their errors (retry created the task once); 390×844 had no overflow. A Rust-built multipart body was accepted by the Bun API with names, types and bytes preserved. Not verified: the Mac app UI (built and launched, but control was not granted), iPhone file selection and saving (simulator in use by another agent) and relaunch. Evidence: `docs/qa/tauri-attachments.md`.
