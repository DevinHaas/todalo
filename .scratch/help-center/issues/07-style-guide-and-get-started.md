# 07. Writing style guide and the Get started articles

Status: resolved
Type: task

**Blocked by:** 04, 06.

Spec: `.scratch/help-center/spec.md` (Writing style, Information architecture, Process). Tone reference: Todoist Help Center notes in the research directory; domain terms in `CONTEXT.md`.

**What it delivers:** The writing style guide in the docs app, and full drafts of the five Get started articles, written from the client code so every step and label matches the app. Screenshots only where text would leave the reader unsure, added to the capture list. Articles stay `published: false` for the owner's review.

**Acceptance:** Content-module tests pass. Every bold label exists verbatim in the client. Platform blocks are used only where Web and Mac differ. List anything in the app that contradicted the spec or looked broken in Comments.

## Comments

2026-11-11 — Claude (branch `help-center-07-get-started`).

Wrote:
- Writing style guide: `apps/docs/WRITING.md` (not published). Voice, title patterns, intro shape, headings, steps, bold labels taken verbatim from `apps/client/src`, `Shortcut` usage, when to use Tip/Note/Warning, when to use a platform block, when a screenshot is justified and how to request one, tables, links, length targets, frontmatter, and the closing (the template adds "Get in touch"; articles must not write their own).
- Full drafts of all five Get started articles, all still `published: false`. Platform blocks only in "Create your account and sign in" (Google sign-in) and "Bring your tasks from Todoist" (connecting Todoist): the Mac app hands both over to the system browser. "Use Todalo on the web or install it on your Mac" uses a comparison table instead of blocks. The glossary follows `CONTEXT.md`, uses `###` per term, and uses the app's name "Smart date recognition" instead of the glossary's "Smart quick-add".
- Related links stay inside Get started. Inline links point ahead to unpublished articles (Tasks & capture, Apps & account): `/tasks-capture/introduction-to-recurring-dates`, `/apps-account/sync-and-working-offline`, `/apps-account/allow-notifications-and-the-microphone-on-mac`, `/apps-account/troubleshoot-sign-in`. Content validation fails a published article that links to an unpublished one, so either publish those articles at the same time as Get started or remove the links first.

Screenshot shots: `quick-add` (already in the list; marked in "Get started with Todalo") and a new `import-chooser` (marked in "Bring your tasks from Todoist"). `import-chooser` answers the import status read with a synthetic preview, because the chooser only appears after a live Todoist connection.

Places where the app contradicts the spec or looks broken:
1. No way to reset a forgotten password, change a password or change your name. The client has no password screen and the Account settings only change the photo. Spec story 72 asks for name, photo and password. The sign-in article tells people to email support.
2. The `GOOGLE_NOT_LINKED` message says "link Google from your account", but the only link button is in **Settings** › **Calendars** (**Link another Google account**). The article documents that path. With no Google account connected, that screen also says "Sign in with Google to get started" next to a button that says "Link another Google account".
3. Sub-task depth: `CONTEXT.md` says sub-tasks nest one level only, but `MAX_SUBTASK_DEPTH = 3` (`packages/db/src/task-parent-validation.ts`) and the Todoist import warning says "todalo nests sub-tasks 3 levels deep". The glossary leaves the depth out; the import article says three levels. `CONTEXT.md` needs updating, or the code does.
4. `CONTEXT.md` is still titled "Habito" (old product name).
5. Mac install is unconfirmed: no Mac App Store link exists anywhere in the repo, and macOS 12 as the minimum is marked as an unverified candidate in `apps/client/README.md`. The article says "Mac App Store" and "macOS 12 Monterey or later"; check both before publishing.
6. The web address is written as `todalo.app`. The spec notes that the new web client is not in production yet.
7. The settings search term "Show goals" (`settings-nav.ts`) differs from the switch's label "Show goals and seasons".
8. On Mac, the Todoist return link opens `app.todalo.client://import/todoist`. Rust has no route for it, so the app only comes to the front. The import screen still updates because it polls while the connection is pending. This works, but it relies on the polling.
9. In-app copy writes "todalo" in lowercase ("Welcome back to todalo.", "Return to todalo"). Articles quote those messages exactly as shown and write "Todalo" everywhere else.
10. A test fails on the help-center base before this work and without my change: `node --test scripts/help-center-demo.test.cjs` fails "API requests disable redirects and do not expose response bodies on failure" (7/8 pass). The root vitest run does not include it.

Checks: docs tests 100/100, typecheck, lint, production build (0 published), preview content validation (40 articles), and in preview mode all five article URLs plus `/get-started` return 200. Only the two articles that have platform blocks render the switcher.


2026-11-11 — Published on the owner's request (`published: true`), merged to main.
