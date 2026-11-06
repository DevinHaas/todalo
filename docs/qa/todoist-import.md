# Todoist import — live verification (2026-11-06)

Setup: branch API on `127.0.0.1:3000` (real Neon DB, migration 0011 applied), shared
client in the browser via Vite (`localhost:5173`), Todoist app "todalo for Todoist"
(751910). Imported into a disposable account `todoist-import-test@example.test`,
not into a real todalo account. Todoist account time zone: Bern (UTC+1).

| Check | Result |
|---|---|
| Sign-up shows "Bring your tasks from Todoist?" once; Import opens `/account#import` | pass; `user_settings.import_prompt_seen_at` set |
| Connect → Todoist consent → callback → back on `/account#import` with preview | pass (5 projects, 51 active tasks, 12 sections, 16 sub-tasks, 7 labels, 4 comments) |
| Selective import (Youtube unchecked) | pass: 51 tasks, 3 projects, 8 sections; 28 Inbox tasks in todalo Inbox; 16 sub-tasks; 2 deeper sub-tasks flattened with a warning |
| Times | pass: "Clean Bathroom" 19:00–19:45 Bern stored as 18:00–18:45 UTC |
| Labels | 0 created: no active Todoist task carries a label (task_labels = 0, as expected) |
| Re-run | pass: preview "51 tasks were imported before"; second run created 0 tasks (only the newly selected Youtube project + its 4 sections) |
| Cancel at Todoist | pass: "Todoist access was not granted. Nothing was imported." |
| Token | never in responses/HTML; revoked after each run |

Fixed during the run: import checkboxes collapsed to 4 px by the global `input`
rule (now shares `.label-option`'s checkbox reset); warning grammar.

Not verified here: Mac app and iOS Simulator runs (native `import_*` commands,
system-browser hand-off and return), recurring tasks (account has none),
completed-task import, expiry after 10/30 minutes.

Known unrelated issue: browser Google sign-in against the dev API fails with
Better Auth `state_security_mismatch` (client on :5173, callback on :3000).
