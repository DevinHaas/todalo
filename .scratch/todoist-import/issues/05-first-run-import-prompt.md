# 05. Offer the import after sign-up

Status: resolved
Type: task

**Blocked by:** 04.

**What it delivers:** `userSettings.importPromptSeenAt` (migration + settings DTO), and a one-time dialog after a new account is created: "Bring your tasks from Todoist?" → Import (opens `/account#import`) or Skip. Either choice sets the timestamp.

**Acceptance:** Shown only after sign-up (email or first Google sign-in that creates the account), never to existing accounts, and only once across devices. Dismissable with Escape; focus is trapped and restored.

## Comments

2026-11-06 — Code complete. Deviation: instead of a client-side 'just signed up' flag, the server marks the prompt due when the account is under 24 h old and `user_settings.import_prompt_seen_at` is null (covers email and Google sign-up, any device, never existing accounts). `POST /api/v1/imports/todoist/prompt` answers it; dialog is a native `<dialog>` (focus trap, Escape = Skip). Not yet run live.

2026-11-06 — Verified in the browser with a new email account; prompt shown once, Import navigates to `/account#import`, seen timestamp stored.
