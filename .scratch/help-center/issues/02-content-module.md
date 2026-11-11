# 02. Content model, content module and integrity tests

Status: resolved
Type: task

**Blocked by:** 01.

Spec: `.scratch/help-center/spec.md` (Information architecture, Content model, Testing Decisions).

**What it delivers:** The article frontmatter schema, the single category list (seven categories, in spec order), and one content module that returns published categories and articles. Everything else reads through it. A preview switch (environment variable) that also returns unpublished articles, for local review only. "Last updated" from the file's last commit. Stub MDX files for all 37 articles with correct title, slug, category, order and `published: false`.

**Acceptance:** Tests through the content module cover every bullet under the primary seam in Testing Decisions, and run under the root test command. A category with no published article is absent; with the preview switch on, drafts appear.

## Comments

2026-11-11 — Built in the root checkout by a Codex run that stopped at its usage limit before committing; checked afterwards by Claude: content module, schema, category list, preview switch (`DOCS_PREVIEW=true`, dev server only, always off when NODE_ENV=production) and all 40 article files as `published: false` stubs. Typecheck needed one fix (re-export `isContentPreview`). Tests (100), lint, typecheck and production build pass; the build publishes 0 articles as expected.
