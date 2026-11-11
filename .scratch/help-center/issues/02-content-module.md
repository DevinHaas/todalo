# 02. Content model, content module and integrity tests

Status: ready-for-agent
Type: task

**Blocked by:** 01.

Spec: `.scratch/help-center/spec.md` (Information architecture, Content model, Testing Decisions).

**What it delivers:** The article frontmatter schema, the single category list (seven categories, in spec order), and one content module that returns published categories and articles. Everything else reads through it. A preview switch (environment variable) that also returns unpublished articles, for local review only. "Last updated" from the file's last commit. Stub MDX files for all 37 articles with correct title, slug, category, order and `published: false`.

**Acceptance:** Tests through the content module cover every bullet under the primary seam in Testing Decisions, and run under the root test command. A category with no published article is absent; with the preview switch on, drafts appear.

## Comments
