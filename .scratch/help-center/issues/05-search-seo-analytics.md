# 05. Search, indexing and analytics

Status: resolved
Type: task

**Blocked by:** 04.

Spec: `.scratch/help-center/spec.md` (Search, indexing and analytics).

**What it delivers:** Full-text search over published articles with the framework's static index, available from every page, results showing category and excerpt, an empty state that points to support, and chips that open pre-filled searches. Sitemap, robots file, per-page titles and descriptions, shared social-preview image slot. PostHog page views and search queries sent to the existing project, tagged as help traffic; reuse the marketing app's configuration approach.

**Acceptance:** Unpublished articles are absent from search data and the sitemap (covered by content-module tests). Analytics is off when its key is not set.

## Comments

2026-11-11 — Built in the root checkout by a Codex run that stopped at its usage limit before committing; checked afterwards by Claude: static search route, search UI with empty state, sitemap, robots (disallows all in preview), PostHog via `instrumentation-client.ts`, off when `NEXT_PUBLIC_POSTHOG_KEY` is unset.
