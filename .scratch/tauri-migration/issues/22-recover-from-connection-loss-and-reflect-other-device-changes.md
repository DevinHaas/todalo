# 22. Recover from connection loss and reflect other-device changes

Status: code-complete (pending: physical devices / native iOS+macOS lifecycle)
Type: task

**Blocked by:** 19, 20, 21.
    **What it delivers:** Users see accurate connection state, retain drafts after failures and see changes from another device after foregrounding/reconnecting or the defined polling interval.
    **Acceptance:** Exercise all migrated mutation categories, including attachments and bulk actions; stop polling in the background, clear account caches and handle stale edits explicitly; do not introduce offline writes or automatic unsafe retries. Basic failure handling and deduplication must already ship with each feature.

## Comments

Published from the approved implementation proposal on 2026-10-04. Eligibility requires every listed blocker to be complete.

### Implementation (2026-10-20, code-complete)

**Polling interval: 60 seconds** (`POLL_INTERVAL_MS`, `apps/client/src/connection.ts`), only while the page is visible. TanStack's `focusManager` follows `visibilitychange`, so polling stops while hidden/backgrounded, and every stale active read refetches on return to the foreground and on reconnect (`onlineManager`, navigator online/offline). No custom lifecycle machinery; calendar live updates (ticket 20) keep their own resume/reconnect handling.

- **Connection state:** `connectionMonitor` = navigator online + whether the last request reached the server (`CONNECTION_FAILED` → unreachable; any server response, even an error, → reachable). Shell shows an always-mounted `role="status"` region: offline / "Can't reach todalo" with **Try again** (refetches active reads); empty while online.
- **No offline writes / unsafe retries:** mutations default to `networkMode: "always"`, so an offline write fails at once (draft kept) instead of being paused and replayed on reconnect. Existing per-feature retries stay (operation IDs, versions, idempotent sets).
- **Drafts across failures:** foreground account re-checks that cannot reach the server (`CONNECTION_FAILED`, `ACCOUNT_UNAVAILABLE`) no longer sign the UI out and clear the cache — previously a blip on foreground unmounted every open draft. The browser account read now maps a rejected fetch to `CONNECTION_FAILED`. Audit of the other categories (composer/quick add, task edit, complete/delete rollback, projects create/rename, sections, labels/filters, bulk, attachments with retry of the same files, settings rollback, keyboard prefs, Ramble commit) found drafts already kept on failure per feature.
- **Stale edits:** the server already rejects version-mismatched edits/moves with 412 `TASK_CHANGED` (tickets 11/13). The editor now offers an explicit choice: **Load current details** (discard draft) or **Keep my changes** (rebase the draft on the newer version, then Save deliberately). No server change needed.
- **Account caches:** cleared on sign-out, remote expiry and account switch (existing, `session.test.ts`); a definite non-connection refresh failure still clears.
- Task live topics were not added: other-device task changes arrive via polling + foreground/reconnect refetch.

**Evidence:** `connection.test.ts` (4: states, offline write fails once and is not replayed, polling pauses hidden/resumes on return, unreachable from reads), `session.test.ts` (+2). `bun run typecheck` green; `bun run test` 74 files / 654 tests passed. Browser QA against the isolated QA API (Playwright, two contexts as two devices): offline indicator + quick-add/project/label drafts kept with the "Cannot reach todalo" alert and nothing created after reconnect; aborted API → "Can't reach todalo" while staying signed in, Try again clears it; other-device rename appeared after foreground (bubbling visibilitychange) and via polling (57 s); hidden page made 0 API requests over 65 s and refetched on return; stale edit showed both choices, Keep my changes saved device A's draft, Load current details loaded device B's title.

**Pending:** physical iPhone/Mac — confirm WKWebView fires `visibilitychange` on background/foreground and online/offline on network loss in the packaged app.
