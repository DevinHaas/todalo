# 09. Articles: Organise & views

Status: resolved
Type: task

**Blocked by:** 07.

Spec: `.scratch/help-center/spec.md` (Information architecture lists the titles). Follow the writing style guide and the Get started articles from ticket 07.

**What it delivers:** Full drafts of every article in the "Organise & views" category, written from the client code and `CONTEXT.md`, with screenshots added to the capture list where needed. The filters article includes the query reference (see `docs/filter-queries.md`) and Filter Assist; the Today article includes time blocking. Articles stay `published: false` for the owner's review.

**Acceptance:** Content-module tests pass. Every bold label exists verbatim in the client. Features the spec lists as out of scope are not described. List any mismatch between the app and the spec in Comments.

## Comments

2026-11-11 — Claude (branch `help-center-09-organise-views`).

Wrote full drafts of all eight Organise & views articles, all still `published: false`, every step and bold label taken from `apps/client/src` (a scripted check found every bold label verbatim in the client): Use the Inbox; Introduction to projects and sections; Introduction to labels; Introduction to filters (query reference from `docs/filter-queries.md` and `packages/server/src/filter-query.ts`, plus Filter Assist, which needs a connected AI provider: the API answers "Connect the Coach in Settings › Coach to use Filter Assist."); Plan your day with the Today view (time blocking: Calendar layout, drag to create, Plan sidebar, move/resize/unschedule, Reschedule overdue, Coach day draft as a Note); Plan your week with the Upcoming view; Use the list, board, calendar and table layouts (including the project Display sort/group/filter table); Find anything with search (Quick Find, the search page, Navigate sections). No platform blocks: nothing in this category differs between Web and Mac. Nothing out of scope is described (Reporting, More, the Assignee stub, collaboration).

Screenshots: one new shot, `filter-dialog` (Add filter dialog with `p2 | p3` and its preview, scrolled to the preview), added to `SHOTS` in `scripts/docs-capture.cjs` and marked in "Introduction to filters". The existing `inbox-list` shot is marked in "Use the Inbox". The capture was not run (needs the local API and demo account). A Today calendar/Plan sidebar shot was considered and dropped: the demo seed has no dated tasks and the capture refuses changed fixtures.

Links to unpublished articles in other categories (publish together or remove first): `/tasks-capture/use-quick-add`, `/tasks-capture/add-or-manage-multiple-tasks`, `/tasks-capture/schedule-a-date-and-time`, `/goals-seasons-rituals/sort-timeless-tasks-into-now-next-and-later`, `/coach/connect-an-ai-provider`, `/coach/review-the-coachs-drafts`.

Places where the app contradicts the spec, `CONTEXT.md` or itself:
1. The Display dialog on the Inbox, Today, Upcoming, label, filter and search pages shows Sort and Filter rows (Grouping "None", Sorting "Smart", Assignee "Me and unassigned", Deadline, Priority, Label "All") that are inert stubs (`schedule-views.tsx` `stubRows`). Assignee is collaboration. Not documented; only projects have working sort/group/filter.
2. Sidebar "Reporting" and "More" are inert (`Inert` in `shell.tsx`). Not documented.
3. "Board" means two things: in a project, a column per section; everywhere else, a status board with To do / In progress / Done (dropping on Done completes the task). Both are documented. Table is projects only.
4. Inbox, label and filter pages bucket overdue tasks under the heading "Upcoming" (`listBuckets`), while Today and Upcoming call them "Overdue". The Inbox article says so.
5. Upcoming's "Later" heading means tasks more than a year ahead, which clashes with the Horizon "Later" in `CONTEXT.md`. Upcoming's "Overdue" only holds tasks dated before this week's Monday; overdue tasks from earlier this week sit under their own day.
6. A filter's page evaluates dates in the API server's local day, while the dialog preview uses the device's (`docs/filter-queries.md`). Near midnight, or with a server in another zone, page and preview can disagree. The article does not explain this.
7. `CONTEXT.md` (Check-in) calls the Plan sidebar "the unscheduled sidebar"; the code and UI call it Plan. Articles use "Plan sidebar". `CONTEXT.md` has no entries for Inbox, project, section, label, filter, Today or Upcoming; nothing there contradicted the code beyond this and the sub-task depth already logged in ticket 07.
8. Quick Add's More options panel says "Create labels in Labels." with no link (the task sheet's equivalent has one), and `@` only offers existing labels; a new label must be made on Filters & Labels first. The labels article has a Note.
9. The sidebar's Search opens Quick Find (names only); the search page (names and descriptions) is reachable only through "View all search results" or `/search`.
10. The project menu shows "⇧⌘C" for Copy link to project as a fixed glyph string, so Windows/web-on-PC readers see Mac symbols.
11. Shortcut `D` is both "Sort by date" on a project and "Choose deadline" on a focused task (different contexts); the sort shortcuts were left out of the articles.

Checks: docs tests 100/100, typecheck, lint, production build, preview content validation (40 articles), and in preview mode `/organise-views` plus all eight article URLs return 200 (server stopped afterwards).


2026-11-11 — Published on the owner's request (`published: true`), merged to main.
