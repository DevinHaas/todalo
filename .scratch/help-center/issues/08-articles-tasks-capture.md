# 08. Articles: Tasks & capture

Status: resolved
Type: task

**Blocked by:** 07.

Spec: `.scratch/help-center/spec.md` (Information architecture lists the titles). Follow the writing style guide and the Get started articles from ticket 07.

**What it delivers:** Full drafts of every article in the "Tasks & capture" category, written from the client code and `CONTEXT.md`, with screenshots added to the capture list where needed. Respect ADRs 0001, 0002, 0003 and 0005 when describing recurrence, smart dates and Ramble. Articles stay `published: false` for the owner's review.

**Acceptance:** Content-module tests pass. Every bold label exists verbatim in the client. Features the spec lists as out of scope are not described. List any mismatch between the app and the spec in Comments.

## Comments

2026-11-11 — Claude (branch `help-center-08-tasks-capture`).

Wrote full drafts of all nine Tasks & capture articles, all still `published: false`: Introduction to tasks, Use Quick Add, Schedule a date and time (with a typed-phrase table taken from `packages/ramble/src/quick-add.ts`), Introduction to recurring dates (Scheduled date vs Completed date, typed repeats, Custom repeat), Set a priority, Use sub-tasks, Add comments and files to tasks, Add or manage multiple tasks (selection toolbar), Dictate tasks with Ramble (spoken commands from `packages/ramble/src/index.ts`; stage-then-commit per ADR 0005). Platform blocks are used only in the Ramble article (microphone permission) and the files article (download vs Mac save). No components were added. Only `tasks-capture/`, `scripts/docs-capture.cjs` and this ticket changed.

Shots added to `SHOTS`: `task-sheet` (Introduction to tasks) and `task-date-panel` (Schedule a date and time). Use Quick Add also marks the existing `quick-add` shot. Not captured yet, so the articles only have comment markers.

Links to unpublished articles in other categories: `/goals-seasons-rituals/introduction-to-goals`, `/organise-views/introduction-to-filters`, `/organise-views/introduction-to-projects-and-sections`, `/apps-account/allow-notifications-and-the-microphone-on-mac` (related link), plus `/get-started/bring-your-tasks-from-todoist` (related). Publish them together or remove the links first.

Where the app and the spec or `CONTEXT.md` disagree, or the app looks wrong:
1. Sub-task depth: `CONTEXT.md` says one level; `MAX_SUBTASK_DEPTH = 3` in the code. The article follows the code (three levels below the top task).
2. Ramble is described in the spec and ADR 0003 as phrase spotting, not AI, but ADR 0006 and the client add an LLM "understanding" step ("Understanding tasks…", dimmed provisional cards, **Retry understanding**). The article describes what the reader sees and never calls it AI; the spec's wording needs a decision.
3. ADR 0005 says a dropped connection loses the whole session; the client keeps staged cards on screen and lets you add them ("Your staged tasks are still here…"). The article follows the client.
4. Quick Add has `@label` autocomplete (`labelMention` in `quick-add.ts`), which the spec puts out of scope. Not documented.
5. Files can't be attached to an existing task. The composer's **Attachment** and **Reminders** chips are disabled stubs. Files only come in through a project's **Add files**/paste/drop, and each file becomes a new task. Attachments are only listed on the task page (**Open task page**), not in the task panel. The spec's "Add comments and files to tasks" promises more than this; the article describes what exists.
6. The open task's **Repeat** menu offers only **Does not repeat**/**Daily**/**Weekly**/**Monthly** (all from the scheduled date). **Completed date**, other intervals and end dates need **Custom…** in Quick Add or the ⌘E edit card.
7. A repeat without a date (for example `Water the plants every day`, which Get started uses as an example) saves an undated task. On completion the next date is completion time + 1 unit, so it likely becomes a timed task at the time you ticked it off. The same applies to every "Completed date" repeat, because `nextOccurrenceOnCompletion` adds the interval to the completion instant. This is from reading the code and has not been checked at runtime. The recurring article tells readers to give a recurring task a date.
8. No weekday recurrence (`every monday`, `every weekday`); ADR 0001 notes this. Numeric dates are day-first (`12/3` = 12 March); `at 4` means 04:00.
9. Deleting tasks (row cross, panel, bulk **Delete**, right-click) has no confirmation and no undo, and it cascades to sub-tasks and comments.
10. Quick Add can only be dragged with the Meta key (`quick-add-drag.tsx` checks `metaKey` only), so it can't be dragged on Windows. Left out of the article.
11. `CONTEXT.md` lists "dictation" under _Avoid_ for Ramble session, but the spec's title is "Dictate tasks with Ramble". I kept the title and avoided the noun in the body.

Checks: docs tests 100/100, typecheck, lint and production build pass; preview content validation passes (40 articles); in preview mode all nine article URLs and `/tasks-capture` return 200.
