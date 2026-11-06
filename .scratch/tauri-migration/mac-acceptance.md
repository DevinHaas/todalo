# Mac app acceptance pass (Mac-first scope)

Physical iPhone is deferred. This pass covers the debug Mac app (and iOS
Simulator where noted) against the branch API on the real database.

## Setup

- API: `cd apps/api && RAMBLE_PORT=3000 bun --env-file=../../.env src/index.ts`
  (port 3000 matches `BETTER_AUTH_URL` and the registered Google callback; stop
  the legacy Next app first, it also uses 3000).
- Mac: `cd apps/client && TODALO_API_BASE_URL=http://127.0.0.1:3000 bun tauri build --debug --bundles app --ci`,
  open `src-tauri/target/debug/bundle/macos/todalo.app`.
- Simulator: `TAURI_TODALO_API_BASE_URL=http://127.0.0.1:3000 bun tauri ios build --debug --target aarch64-sim --ci`,
  then `xcrun simctl install booted src-tauri/gen/apple/build/arm64-sim/todalo.app`.

Mark each line `[x]` pass, `[!]` fail (add a note), `[-]` skipped.

## Checklist

### 02 Session
- [x] Email/Google sign-in reaches the app (2026-11-06)
- [ ] Quit + relaunch keeps you signed in (Keychain)
- [ ] Sign out returns to sign-in; relaunch stays signed out

### 03 Today
- [ ] Today lists the same tasks as the legacy web app
- [ ] Opening a task shows its detail; back returns to Today

### 04 Google
- [x] Google sign-in returns to the running app (warm) (2026-11-06)
- [ ] Quit app, start Google sign-in again, cancel in browser → app shows cancelled, no crash
- [ ] Link Google from Account (if not already linked)

### 05 Basic tasks
- [ ] Create, complete and delete a task; counts in sidebar update

### 06 / 21 Ramble
- [ ] First use prompts for microphone; deny → clear message; allow → transcription
- [ ] Speak 2–3 tasks, "Add tasks" saves them once; they appear in Today

### 08 / 09 Projects and attachments
- [ ] Create, open, rename, delete a project
- [ ] Drag a file onto a project and paste a file; download it back; survives relaunch

### 11 / 12 Editing and quick add
- [ ] Edit title, description, date, recurrence; completing a recurring task moves it
- [ ] Quick add highlights "tomorrow 5pm every week"; toggling smart dates in Settings disables it

### 13–15 Organization
- [ ] Sections, sub-tasks, labels, saved filters
- [ ] Drag reorder, multi-select bulk complete/move

### 16 / 17 Views
- [ ] Upcoming and schedule views; list ↔ board layout; drag a card between columns

### 18 / 19 Search and keyboard
- [ ] Search finds a task; `app.todalo.client://` task link opens it
- [ ] Shortcuts work (⌘K, q, etc.); customize one in Settings; ⌘Q/⌘W are not hijacked

### 20 Calendars
- [ ] Connected Google calendar events show; event changed in Google appears without reload

### 22 Lifecycle
- [ ] Stop the API, make an edit → clear error, input kept; restart API → recovers
- [ ] Edit in legacy web app → Mac app reflects it after refocus

## Notes / failures
