# Help center writing style guide

How to write a Todalo help article. It is for anyone drafting articles, people
and agents alike, so that every article reads as if one person wrote it. This
file is not published. The articles in `content/get-started/` follow it and
are the worked examples; copy their shape.

Before you write, read the client code for the feature (`apps/client/src`), the
domain glossary (`CONTEXT.md` at the repository root) and any ADR that covers
it (`docs/adr/`). Write every step from the code, not from memory or from the
legacy app.

## Voice

- Second person, present tense: "You can add a task from anywhere."
- Plain and calm, like the app's own copy. No hype ("powerful", "seamless",
  "simply", "just"), no exclamation marks, no jokes.
- Contractions are fine: "you'll", "don't", "it's".
- Short sentences. One idea per sentence. Prefer "use" to "utilise", "about"
  to "regarding", "start" to "initiate".
- British spelling in our own prose, as in the category names: "organise",
  "colour". Interface labels keep the spelling the app uses (the app writes
  "Recognize" in one hint; quote it as is if you quote it at all).
- Write "Todalo", capitalised, even though the app writes "todalo". When you
  quote an on-screen message word for word, keep the app's lowercase inside the
  quotation marks.
- Use the glossary terms from `CONTEXT.md` and avoid the words it lists under
  _Avoid_: "Season", never "quarter"; "Ritual", never "routine"; "Pattern",
  never "insight"; "Draft", never "suggestion"; "Ramble session", never
  "voice mode". Capitalise the names of Todalo's own concepts when they
  appear as features (Season, Ritual, Horizon, Coach, Ramble, Milestone) and
  the views (Inbox, Today, Upcoming). Ordinary words stay lower case: task,
  project, label, goal, filter.
- Say "the Coach" (it is a feature, not a person). Never call it "AI
  assistant" or "agent".
- "Click" for Web and Mac. "Tap" is reserved for iOS. "Press" is for keys.
- Do not promise what the code does not do. If a step depends on a server
  response or a third party (Google, Todoist), say what the reader sees, not
  how it works.

## Titles

Sentence case, no full stop, no "in Todalo" suffix (the site is only about
Todalo). Use one of three patterns:

| Article kind | Pattern | Examples |
| --- | --- | --- |
| A concept the reader needs to understand | Introduction to X | Introduction to recurring dates; Introduction to goals |
| A task the reader wants to do | Verb-first | Set a priority; Plan a season; Bring your tasks from Todoist |
| A fix | Troubleshoot X | Troubleshoot sign-in; Troubleshoot Google Calendar |

The frontmatter `description` is one sentence of 8 to 20 words, written as a
verb-first summary of what the reader will be able to do. It is the meta
description and the search excerpt, and the page shows it under the title, so
do not repeat it as the first sentence of the intro.

## Intro

Two to four sentences, no heading, straight after the frontmatter.

1. Start from the reader's situation or need ("Most days start with more
   to do than fits."), or say plainly what the feature is for.
2. Say what Todalo does about it, in one or two sentences.
3. Optionally, end with one sentence on where to start or what you need first.

Do not define every term, list what the article covers or say "In this
article". Do not open with "Todalo is…" or "Welcome".

## Headings

- Only `##` (second level) and `###` (third level). The table of contents
  lists `##` headings only, so every `##` must make sense on its own.
- How-to `##` headings start with a verb and name one job: "Add your first
  task", "Change or remove a recurring date", "Sign out".
- Reference sections may be noun phrases: "Keyboard shortcuts", "What gets
  imported", "Limits".
- Use `###` for alternative methods inside one job ("Use Quick Add", "Use the
  task menu") or the parts of a reference.
- No numbers, questions or full stops in headings. Sentence case.
- Do not write a "Get in touch" heading. The article template adds the
  closing "Get in touch" section with the support address and the feedback
  button after every article. Do not add another contact line in the body.

## Steps

- A step list follows a one-line lead-in that states the goal and ends with a
  colon: "To create a project:".
- Wrap the list in `<Steps>` with one `<Step>` per action, or write a plain
  Markdown numbered list. Use one style per article.
- Three to six steps. One action per step. If a list grows past six, split it
  under two headings.
- Imperative, with a location cue where the reader has to look for the
  control: "Click your name at the top left of the sidebar." "Click **Add
  task** at the top of the sidebar."
- The final step says what happens when the reader is done, if it is not
  obvious: "Click **Add**. The project opens."
- A keyboard alternative goes in a Tip after the steps, not in a step.

## Interface labels

- Every label the reader clicks, reads or types into is **bold** and spelled
  exactly as the client renders it, including capitals, ampersands and
  ellipses: **Filters & Labels**, **My Projects**, **Help & resources**,
  **Log out** (not "Sign out"; the app's button says "Log out").
- Find the label in `apps/client/src` before you write it. Search for the
  visible text, the `aria-label` or the `title`. If a control has no visible
  text (an icon button), describe it and give its accessible name in bold:
  "click the waveform button (**Open Ramble**)".
- Menu paths use ›: "**Settings** › **Integrations**". Settings sections are
  listed in `apps/client/src/settings-nav.ts`.
- Do not bold the names of views or features when they are not labels on
  screen: "the Today view", "the Coach".
- Text the reader types goes in `inline code`: type `call mom tomorrow at 4pm`.
- Messages the app shows go in quotation marks, word for word: the app shows
  "Waiting for Todoist…".
- Keyboard shortcuts use the `Shortcut` component (also available as `Kbd`):
  `<Shortcut keys="Q" />`, `<Shortcut keys="Mod+Shift+R" />`. Write `Mod` for
  the Command/Control key; the component shows ⌘ or Ctrl to match the
  reader's platform, so never write "Cmd" or "Ctrl" yourself. Default
  shortcuts are in `packages/ramble/src/keyboard.ts`.

## Callouts

One to three sentences each. At most three callouts in a how-to article.
Never put a step inside a callout.

| Component | Use it for | Example |
| --- | --- | --- |
| `<Tip>` | A faster way, a keyboard shortcut, or a pointer to a related article | "Press `<Shortcut keys="Q" />` to open Quick Add from anywhere." |
| `<Note>` | A limit or caveat to know before relying on the feature | "Only confirmed tasks are saved. Dimmed cards are still being checked." |
| `<Warning>` | Something that deletes data or cannot be undone, or that will fail under a stated condition | "Deleting a project also deletes its tasks." |

Notes are the most common. Warnings are rare: use one only when the reader
could lose something. `<Callout type="note" title="…">` exists for a custom
title; prefer the three short forms.

## Platform blocks

Todalo runs on the web and on Mac. Write everything once for both platforms,
outside any block. Use a platform block only where the steps or what the
reader sees genuinely differ, for example:

- sign-in with Google (the Mac app hands over to the system browser);
- connecting another service (Todoist, Google Calendar) from the Mac app;
- system permissions, notifications, the microphone, the title bar.

Not a reason for a block: keyboard shortcuts (the `Shortcut` component
already switches modifiers), wording differences you could avoid by
describing the control instead of the window, or a feature that is the same
on both.

Shape:

```mdx
<Platform on="web">
1. Click **Continue with Google**.
2. Choose your Google account. Todalo opens again, signed in.
</Platform>

<Platform on="mac">
1. Click **Continue with Google**. Your default browser opens.
2. Choose your Google account, then switch back to Todalo.
</Platform>
```

- Put the block where the difference is, under the heading it belongs to,
  never around a whole article.
- Write both variants in full. Shared lines before and after the block are
  written once.
- An article that contains a block shows the Web/Mac switcher automatically.
- Set `platforms` in the frontmatter to every platform the article applies
  to, not only the ones with blocks. A Mac-only article is
  `platforms: ["mac"]` and needs no blocks.

## Screenshots

Text first. Add a screenshot only where the words alone would leave the
reader unsure where to click: a control without a label, a crowded panel, a
choice whose layout matters. Most articles need none; an article should
rarely have more than two.

- Shots are tight crops of one part of the real web client, never the whole
  window, captured in light and dark from the demo account.
- To ask for a shot, add an entry to `SHOTS` in `scripts/docs-capture.cjs`
  (name, route, steps, crop) and leave a comment where it belongs:
  `{/* screenshot: import-chooser */}`. Do not reference an image file that
  does not exist; the content tests fail the build on missing images.
- Once the capture has run, replace the comment with:

  ```mdx
  <ThemedScreenshot light="/screenshots/import-chooser.light.png" dark="/screenshots/import-chooser.dark.png"
    width={…} height={…} alt="The Todoist import list with three projects ticked and Also import options below" />
  ```

- Alt text describes what the image shows in one full sentence, including the
  state that matters ("with Sections ticked").
- Place the shot directly after the step it illustrates.
- Mac-only interface (permission prompts, notifications, the title bar) is
  captured by hand; ask for it in the ticket instead of the shot list.
- Generated illustrations never appear in articles.

## Tables

Use a table for reference content the reader looks up rather than reads:
shortcuts, typed date phrases, what is and is not imported. Two or three
columns with plain headers ("Type this" / "To get this"; "Action" /
"Shortcut"). Keep steps out of tables.

## Links

- Link to other articles with their address: `[Use Quick Add](/tasks-capture/use-quick-add)`.
- Link text is the article title or a phrase that says where it goes. Never
  "click here".
- `related` in the frontmatter lists up to four article addresses, most useful
  first.
- A published article can only link to published articles; the build fails
  otherwise. Draft freely, but when you link ahead to a category that is not
  published yet, list those links in the ticket so the owner can publish
  them together or remove them.

## Length

| Article kind | Target |
| --- | --- |
| How-to | 400 to 1,000 words |
| Introduction | 600 to 1,500 words |
| Reference or glossary | As long as the reference needs |
| Troubleshoot | 300 to 900 words, one `##` per symptom |

If a how-to runs past 1,000 words, it is probably two articles.

## Frontmatter

```yaml
---
title: "Bring your tasks from Todoist"
description: "Import your Todoist projects, sections, tasks and labels into Todalo and choose what comes over."
category: "get-started"
order: 4
section: "First steps"
platforms: ["web", "mac"]
related: ["/get-started/create-your-account-and-sign-in"]
published: false
---
```

`section` (optional) is the heading the article is listed under on its
category page. Sections appear in the order of their first article (by
`order`); an article without one is listed under the category's name. Keep
sections few: two or three per category, or one for a small category. Reuse
the exact spelling of an existing section, or you create a new one.

Add `badge: "experiment"` to Coach articles. Leave `published: false`; the
owner publishes after review.

## Closing

Every article ends with the body's last section. The template then adds "Get
in touch" with `support@todalo.app` and the feedback button. Do not end with a
summary, "That's it!", or "We hope this helped".

## Checklist before you hand an article over

- Title follows a pattern; the description is one sentence.
- The intro is two to four sentences with no heading.
- Every `##` heading starts with a verb or is a reference noun phrase.
- Every bold label exists word for word in `apps/client/src`.
- Platform blocks appear only where Web and Mac differ.
- Shortcuts use `Shortcut`, never typed modifier names.
- Screenshots are comments with a matching entry in the shot list.
- Terms match `CONTEXT.md`.
- `published: false`.
- Anything in the app that looked broken or contradicted the spec is written
  down in the ticket's Comments.
