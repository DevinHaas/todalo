# 04. Landing page, category pages and article template

Status: resolved
Type: task

**Blocked by:** 02, 03.

Spec: `.scratch/help-center/spec.md` (Landing and category pages, Article template).

**What it delivers:** Landing (heading, hero slot, search box slot, four suggested-search chips, category card grid, "Still need a hand?"), category page, and the article template: breadcrumbs, intro, sidebar (platforms, scroll-tracking table of contents, related articles, last updated), mobile table of contents, "Experiment" badge, closing "Get in touch" with the support address and the FeatureSpace control (see research notes; fall back to a plain link). MDX body components: numbered steps, Tip / Note / Warning callouts, tables, themed screenshot (light and dark file, paper backdrop). Illustration slots use neutral placeholders until ticket 16.

**Acceptance:** All pages read only through the content module. Works at phone width, keyboard navigable, images require alt text. Both themes checked by eye with the preview switch on.

## Comments

2026-11-11 — Built in the root checkout by a Codex run that stopped at its usage limit before committing; checked afterwards by Claude: landing, category and article pages, sidebar with tracking table of contents, Experiment badge, Get in touch with support address and the FeatureSpace button, callouts, themed screenshot component, illustration placeholders. Dark-mode links use a lighter red (#f28e80) for contrast. In preview mode all 51 routes return 200 with no server errors. Not checked by eye in a browser yet.

2026-11-11 — Layout rebuilt to match the Todoist Help Center (branch `help-center-todoist-layout`), keeping Todalo's fonts, paper/ink/red tokens (light and dark), illustrations and logo. Shared chrome: 72px header, 1136px page, breadcrumb pill (7% ink tint) and a full-width 56px search bar that opens the search dialog (also used on the landing hero and 404). Category page: visually hidden H1; left accordion of all visible categories (current one a `<details>` listing its sections with a 2px red bar that tracks scroll, others links), content column of sections, each an H2 and a two-column grid of borderless article links with dividers and a "Read article →" pill on hover/focus. The chip category switcher and the category illustration header are gone (illustrations now appear on the landing page only). Article page: 44px Geist title with a full-width divider; sticky 240px sidebar (Status: Experiment badge, Platforms chips, Table of Contents with "Overview" first and the red active bar, Related articles, "Last updated by" with an initial avatar and long date); 800px content column with a 650px text column, 18/31.5 body, 31px H2s, red step numbers, tinted Tip/Note/Warning callouts with icons. Each `<Platform>` block is a bordered card headed by "Select Platform:" + a select pill; every select reads and writes the same global, remembered choice, all variants stay in the HTML. Sanela is now used only on the landing hero (and 404). Mobile (≤768px): single column, accordion above the sections, sidebar below the title with a collapsible "On this page".
New optional frontmatter `section` (string): groups a category's articles under headings, ordered by their first article; missing → the category name. All 40 articles have one (Get started: First steps, Reference; Tasks & capture: Adding tasks, Dates & repeats, Organising tasks; Organise & views: Daily views, Projects, labels & filters, Layouts & search; Goals: Goals, Seasons, Rituals; Coach: The Coach; Integrations: Google Calendar; Apps & account: Settings & shortcuts, Account & sync, What's new). Tests cover grouping, order, unpublished exclusion, default name and empty values. `needsPlatformSwitcher` was removed (the selector now lives in each platform block). Also fixed: ToC entries showed lower-cased slugs when a heading's title was JSX. Comparison screenshots: `todalo-help-center-notes/todoist-layout/ours-*.jpg`.

