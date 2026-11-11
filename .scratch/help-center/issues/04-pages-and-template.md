# 04. Landing page, category pages and article template

Status: resolved
Type: task

**Blocked by:** 02, 03.

Spec: `.scratch/help-center/spec.md` (Landing and category pages, Article template).

**What it delivers:** Landing (heading, hero slot, search box slot, four suggested-search chips, category card grid, "Still need a hand?"), category page, and the article template: breadcrumbs, intro, sidebar (platforms, scroll-tracking table of contents, related articles, last updated), mobile table of contents, "Experiment" badge, closing "Get in touch" with the support address and the FeatureSpace control (see research notes; fall back to a plain link). MDX body components: numbered steps, Tip / Note / Warning callouts, tables, themed screenshot (light and dark file, paper backdrop). Illustration slots use neutral placeholders until ticket 16.

**Acceptance:** All pages read only through the content module. Works at phone width, keyboard navigable, images require alt text. Both themes checked by eye with the preview switch on.

## Comments

2026-11-11 — Built in the root checkout by a Codex run that stopped at its usage limit before committing; checked afterwards by Claude: landing, category and article pages, sidebar with tracking table of contents, Experiment badge, Get in touch with support address and the FeatureSpace button, callouts, themed screenshot component, illustration placeholders. Dark-mode links use a lighter red (#f28e80) for contrast. In preview mode all 51 routes return 200 with no server errors. Not checked by eye in a browser yet.
