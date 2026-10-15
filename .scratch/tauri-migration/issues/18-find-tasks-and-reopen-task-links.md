# 18. Find tasks and reopen task links

Status: code-complete (native runtime and physical devices pending)
Type: task

**Blocked by:** 14.
    **What it delivers:** Users search their tasks and open existing task URLs from inside or outside the app.
    **Acceptance:** Preserve current search semantics and route destinations; support cold/warm links and post-login continuation; validate untrusted/unknown routes, unauthorized task IDs and browser refresh fallback. Search and routing do not require the later release-hosting cutover.

## Comments

Published from the approved implementation proposal on 2026-10-04. Eligibility requires every listed blocker to be complete.

2026-10-16 — Implemented: shared legacy search rules (`packages/server/src/search.ts`, also used by the legacy Next page and Quick Find), owner-scoped read-only `GET /api/v1/search` and `/api/v1/find`, native `search_tasks`/`quick_find`, sidebar Search → Quick Find, `/search?q=`, editor "Task link · Copy link" (native copies the https API-origin link via `task_link`), and native task deep links (`app.todalo.client://tasks/<id>`, strict Rust allow-list, `next_link` hand-off for cold/warm launch, navigation only). Evidence: `docs/qa/tauri-search-links.md` (unit/route/Rust tests and browser QA). Not verified: native runtime (simulator/Mac), WKWebView clipboard, iOS cold launch (known to drop the URL with tao 0.37.1), universal links and production HTML fallback (release items).
