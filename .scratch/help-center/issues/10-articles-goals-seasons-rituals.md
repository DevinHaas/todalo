# 10. Articles: Goals, seasons & rituals

Status: resolved
Type: task

**Blocked by:** 07.

Spec: `.scratch/help-center/spec.md` (Information architecture lists the titles). Follow the writing style guide and the Get started articles from ticket 07.

**What it delivers:** Full drafts of every article in the "Goals, seasons & rituals" category, written from the client code and `CONTEXT.md`, with screenshots added to the capture list where needed. Rituals are described as optional. Articles stay `published: false` for the owner's review.

**Acceptance:** Content-module tests pass. Every bold label exists verbatim in the client. Features the spec lists as out of scope are not described. List any mismatch between the app and the spec in Comments.

## Comments

2026-11-11 — Claude (branch `help-center-10-goals`).

Wrote full drafts of all five Goals, seasons & rituals articles, all still `published: false`, every step taken from `apps/client/src` and goal status from `packages/server/src/goal-status.ts` (a scripted check found every bold label verbatim in the client): Introduction to goals (create, edit, link projects and tasks, rule and Coach goal suggestions, the goal page, archive, **Settings** › **General** › **Show goals and seasons**); Plan a season (the five-step setup with and without the Coach, changing a running season, Capacity, ending a season); Track progress with milestones and goal status (Milestone switch, done criteria, the "Complete milestone" confirm, the four statuses, the signals behind them without the tunable numbers, the trajectory chart, Coach explanations and recommendations); Introduction to rituals (all four described as optional and off by default, Settings › Rituals, Check-in in the Plan sidebar, Evening/Weekly/Season review steps, shortcuts, notifications); Sort timeless tasks into Now, Next and Later (task details, right-click menu, `h` sequences, bulk Horizon, the Plan sidebar groups, the Now warning, Later). No platform blocks: nothing here differs between Web and Mac. Nothing out of scope is described.

Season setup and the Coach: with a provider, the Coach turns the Focus answer into up to four suggested goals (switched on, sparkle-marked, **Suggest again**) and asks one starting-point question per suggestion. Without one, there are no suggestions; the user's own goals are listed switched off, and the Add a goal form opens by itself when they have none. A failed call shows "The Coach could not answer. Pick or add the goals yourself, or try again."

Screenshots: one new shot, `season-setup-goals` (setup's Goals step, no Coach, "Run a half marathon" switched on with a target, Primary), added to `SHOTS` in `scripts/docs-capture.cjs` (now also imports `GOALS` from the demo fixtures) and marked in "Plan a season". It writes nothing: the setup saves only on Start season. The capture was not run (needs the local API and demo account).

Links to unpublished articles in other categories (publish together or remove first): `/coach/connect-an-ai-provider`, `/coach/introduction-to-the-coach`, `/coach/review-the-coachs-drafts`, `/organise-views/plan-your-day-with-the-today-view`, `/organise-views/use-the-inbox`, `/tasks-capture/add-or-manage-multiple-tasks`, `/apps-account/allow-notifications-and-the-microphone-on-mac`, `/get-started/todalo-glossary`.

Places where the app contradicts the spec, `CONTEXT.md` or itself:
1. Goal status needs a completed Weekly review in the season (`reviewed` in `goal-status.ts`, `getStatusInputs`); without one every goal is Too early and the trajectory stays hidden. That contradicts `CONTEXT.md` (Rituals: "the rest of the app (goals, time blocks, the Coach) works without any of them") and the Settings hint "the rest of the app works the same without them". The articles say it plainly in Notes.
2. Season lengths differ by place: the setup offers 4, 6, 8 and 12 weeks; the End season dialog and the Season review offer 12 weeks, 4 weeks or Custom. `CONTEXT.md` lists 12, 4 or custom.
3. A running season can only add new goals (**New goal**); existing goals join only when a season starts or ends. Documented as a Note.
4. Coach-suggested and newly added goals show their target as plain text in the setup; only the user's existing goals have an editable target field there. Targets can be moved afterwards on the Season page.
5. The setup's Starting point hint says "The Coach plans from here" even without a connected provider.
6. `CONTEXT.md` (Check-in) says it suggests Inbox, overdue and due-today tasks; the code's Plan sidebar also lists Next 7 days and the Now/Next/Inbox/Later horizon groups.
7. A milestone with done criteria shows "Reached" on the goal page once every criterion is ticked, even while its task is still open, but goal status counts it only in the week the task is completed (`within(item.completedAt)`).
8. `CONTEXT.md` (Horizon) says Later tasks are never proposed "until the user names it or it comes due"; the Coach chat prompt only says never "unless the user names them". The article states only the latter.
9. The Season review has no notification (`readyRituals` covers three rituals); `CONTEXT.md` (Ritual notification) is consistent, Settings' "one notification per ritual" is not quite.
10. The `ritual.season-review` shortcut note in `packages/ramble/src/keyboard.ts` has a typo ("while it is off.or no season is running").
11. Ritual notifications only fire while the app is open (client-side check every 30 s); the Settings hint says so and the article repeats it.

Checks: docs tests 100/100, typecheck, lint, production build, and in preview mode `/goals-seasons-rituals` plus all five article URLs return 200 (server stopped afterwards).

2026-11-11 — Published on the owner's request (`published: true`), merged to main.
