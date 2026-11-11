# 15. Illustration style trial

Status: ready-for-human
Type: task

**Blocked by:** None.

Spec: `.scratch/help-center/spec.md` (Illustrations).

**What it delivers:** The "Get started" card generated with Higgsfield in the five candidate styles, each with its background removed and shown on the light and the dark page background. The owner picks one.

**Acceptance:** The owner's choice is recorded in Comments with the prompt, model, settings and reference image used.

## Comments

2026-11-11 — Trial generated. Model `gpt_image_2_6`, aspect 3:2, quality medium, background transparent, no reference image, one image per style. Subject: seedling with two leaves in a round pot. Files: `/Users/devinhasler/projects/todalo-help-center-notes/style-trial/` (1-sliced-3d, 2-sliced-ink, 3-sliced-glass, 4-paper-cut, 5-isometric-line). Higgsfield job IDs: 83889a14-00ce-4846-8b38-6b894a1bdab5, a8b6e81b-405e-4806-8b85-8be87a100e88, 888296c8-ee5a-4f77-8bfe-4adb0b602e87, d642557f-ee59-493e-bf4a-735ad060584a, 37750f20-63b0-44b9-a413-2f7815b3f302. On both backgrounds: 1 and 3 read well; 2 and 5 are too faint on dark; 4 shows a white halo on dark. Waiting for the owner's pick.

2026-11-11 — Owner picked style 2 (sliced ink) and asked for it more precise and detailed. Round 2, model `gpt_image_2_6`, quality high, transparent background, 3:2: A = refined with trial job a8b6e81b as reference (job 9f376290-b639-4528-8800-da6b65734767), B = fresh logo-like prompt (120e458a-b087-435a-b78f-ff1b89f7e184), C = SVG output (30d1c1bd-ca68-405c-8ccf-df356f07526f), D = fine-line ~60 rows with reference (f688d35b-6670-4c15-905d-598370816aa3). Dark mode: single near-black file, flipped in CSS with `filter: invert(1) hue-rotate(180deg)`; red turns lighter pink-red on dark. Waiting for the owner's pick among A–D.
