# 16. Illustration set and style guide

Status: resolved
Type: task

**Blocked by:** 04, 15.

Spec: `.scratch/help-center/spec.md` (Illustrations).

**What it delivers:** Landing hero, seven category cards and the social-preview image in the chosen style, using the trial image as the style reference, placed into the docs app. The illustration style guide in the repo records prompt wording, palette values, reference image, model and settings.

**Acceptance:** Every image reads on both page backgrounds, contains no people or text, and the owner has approved the set.

## Comments

2026-11-11 — Set v1 generated with `gpt_image_2_6`, quality high, transparent (OG opaque #f6f5f2), B as `image_references`. Files: `/Users/devinhasler/projects/todalo-help-center-notes/set-v1/`. Jobs: hero 5492ed09, tasks-capture 286b6406, organise-views e02fdb39, goals-seasons-rituals 3d5bfb2c, coach 22a9dee7, integrations 4759dc55, apps-account d4117f76, og 85f27702. Known issue: the six new cards and the hero use thinner, denser lines than B; the OG image uses B's heavier weight. Waiting for the owner's call before placing them in the app.

2026-11-11 — Owner asked for the Coach card to look like the in-app Coach button (round liquid blob with the lucide Sparkles icon, `liquid-coach.tsx`). Two variants, refs B + integrations card for line weight: round button with sparkle cut out (fbf2fab7-cc93-4b7e-8154-ddf4b693524c), button flowing into the bar (46b59023-3a03-41ea-887b-5f7bcc36effb). Waiting for the owner's pick.

2026-11-11 — Final set placed. Owner liked the thin-line cards; Coach uses variant 1 (the app's Coach button). Get started and the social image were regenerated in the thin weight (3aa2b74e, 6746ed56). Files are WebP in `apps/docs/public/illustrations/` (about 360 KB total, down from 4 MB of PNG) and `apps/docs/public/og.jpg` (1200×630), wired into the landing, category pages and Open Graph/Twitter metadata. Dark mode flips the ink in CSS. Style guide: `apps/docs/ILLUSTRATIONS.md`. Checked by screenshot in both themes. Also aligned the landing's suggested searches with the spec.
