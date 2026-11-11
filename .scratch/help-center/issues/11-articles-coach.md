# 11. Articles: Coach

Status: resolved
Type: task

**Blocked by:** 07.

Spec: `.scratch/help-center/spec.md` (Information architecture lists the titles). Follow the writing style guide and the Get started articles from ticket 07.

**What it delivers:** Full drafts of every article in the "Coach" category, written from the client code and `CONTEXT.md`, with screenshots added to the capture list where needed. Every article carries the Experiment badge. See ADR 0007 for provider sign-in. Articles stay `published: false` for the owner's review.

**Acceptance:** Content-module tests pass. Every bold label exists verbatim in the client. Features the spec lists as out of scope are not described. List any mismatch between the app and the spec in Comments.

## Comments

2026-11-11 — Claude (branch `help-center-11-coach`).

Wrote full drafts of all four Coach articles, each with `badge: "experiment"` and `published: false`, every step taken from `apps/client/src` (coach-bar, liquid-coach, coach-screens, coach-chat-screens, pending-changes, draft-views, planning-screens, pattern-screens) and the API's Coach routes; a scripted check found every bold label verbatim in the client.
- Introduction to the Coach: what it can and can't do, the Coach button and bar, the Coach sidebar and New conversation, attachments (kinds and limits from `coach-documents.ts`/`attachment-limits.ts`), tidy-up, planning sessions.
- Connect an AI provider: ChatGPT sign-in (platform block: web pastes the `127.0.0.1` address, Mac returns by itself), OpenAI/Anthropic/OpenRouter keys, Ollama, the Coach model picker and fallback, test/disconnect, and what data is sent where.
- Review the Coach's drafts: where drafts appear, deciding in the bar and the Plan sidebar, the change groups, tasks that don't fit, changes left out.
- Manage what the Coach has learned: how patterns are learned, see/edit/delete, Learn now, clearing the conversation and documents.
No components added. Only `apps/docs/content/coach/`, `scripts/docs-capture.cjs` and this ticket changed. Nothing from the dev-only liquid panel is described.

Shot added to `SHOTS`: `coach-providers` (Settings › Coach provider cards, none connected), marked in "Connect an AI provider". Not captured. The bar and drafts were left without shots: they need a connected provider and a live model call.

Links to unpublished articles in other categories (publish together or remove first): `/goals-seasons-rituals/introduction-to-goals`, `/goals-seasons-rituals/introduction-to-rituals` (related), `/organise-views/plan-your-day-with-the-today-view`, `/organise-views/plan-your-week-with-the-upcoming-view` (related).

Mismatches between the app, the spec, `CONTEXT.md` and the ADRs (the articles follow the code):
1. Settings › Coach's opening hint says the Coach "explains each goal's status in plain words; everything else works the same without one", and its closing hint says only goal titles, season targets, status numbers and patterns are sent "to write the explanations". Both understate it: chat, drafts and planning also send task titles and times, project and section names, calendar busy times (titles with the switch on), the last 20 chat messages, pending draft changes, and document text or images. The connect article lists what the code sends; the in-app hints should be updated.
2. Ollama: the server makes the call and accepts only localhost, so Ollama works only when the Todalo server runs on the same computer. On the hosted service it can't reach a user's Ollama. The spec and ticket treat "local Ollama" as a normal option; the article says what the code allows.
3. ChatGPT sign-in on the hosted web is the paste flow (copy a `http://127.0.0.1…` address that doesn't load); only a localhost web origin gets the automatic callback, and the Mac app uses a loopback listener. ADR 0007 says OpenAI hasn't published this flow for third-party apps; the article carries a Warning. ADR 0007 still calls the app "Habito".
4. `CONTEXT.md` Draft says changes are "added, moved, removed"; the code also drafts sub-tasks, attachments, completions, deletions, horizon changes (Re-sorted) and Keep.
5. When every change in an accept is stale, the API answers "A task in this draft changed since the Coach drafted it. Draft again." but the client maps the 412 to the generic "This task changed on another device. Review it and try again.", even when the task changed on the same device. The article avoids quoting either.
6. Deleting a pattern has no confirmation and no undo (the article has a Warning). Deleting through a draft does confirm ("Delete N tasks?").
7. "New conversation" also deletes the session documents and drops pending "attach" changes that use them; the sidebar's tooltip only mentions the documents.
8. Images reach the model only for OpenAI, Anthropic and ChatGPT (`acceptsImages`); OpenRouter and Ollama get the file name only, with no message in the UI.
9. The recommendation button reads "Chat with coach" (lower-case c), unlike "Coach" elsewhere. Not quoted in the articles.

Checks: docs tests 100/100, typecheck, lint, production build, preview content validation (40 articles); in preview mode `/coach` and all four article URLs return 200, articles show the Experiment badge (server stopped afterwards).
