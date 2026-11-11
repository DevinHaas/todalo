# 06. Screenshot capture script

Status: in-progress
Type: task

**Blocked by:** 01.

Spec: `.scratch/help-center/spec.md` (Screenshots).

**What it delivers:** A script that drives the web build of the client signed in to the seeded demo account, at a fixed size, and writes each named shot in light and dark into the docs app. Shots are declared in one list (name, route, steps to reach the state, crop region or element). Check that the demo seed data reads as realistic tasks, projects and goals; improve the seed if it does not. Document how to run it and how to add hand-captured Mac shots.

**Acceptance:** Running the script against a local client produces two example shots in both themes, and the themed screenshot component can show them. The script is not part of the build or test command.

## Comments

2026-11-11 — Built in the root checkout by a Codex run that stopped at its usage limit before committing; checked afterwards by Claude: capture script `scripts/docs-capture.cjs`, demo-data script `scripts/help-center-demo.cjs` (with test) and run guide `docs/help-center-screenshots.md`. Not run yet: no screenshots exist; it needs a local API and client against a development database. Remaining: run it once and produce the two example shots.
