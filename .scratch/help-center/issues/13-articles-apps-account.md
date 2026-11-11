# 13. Articles: Apps & account

Status: resolved
Type: task

**Blocked by:** 07.

Spec: `.scratch/help-center/spec.md` (Information architecture lists the titles). Follow the writing style guide and the Get started articles from ticket 07.

**What it delivers:** Full drafts of every article in the "Apps & account" category, written from the client code and `CONTEXT.md`, with screenshots added to the capture list where needed. "What's new" is generated at build time from the client's release notes data, not copied by hand; this is the one permitted read of client data. The keyboard shortcuts article is generated or checked against the keyboard registry. Articles stay `published: false` for the owner's review.

**Acceptance:** Content-module tests pass. Every bold label exists verbatim in the client. Features the spec lists as out of scope are not described. List any mismatch between the app and the spec in Comments.

## Comments

2026-11-11 — Claude (branch `help-center-13-apps-account`).

Wrote full drafts of all seven Apps & account articles, all still `published: false`, every step taken from `apps/client/src` (a scripted check found every bold label verbatim in the client, except the macOS labels **Allow notifications** and **Don't Allow**, which are System Settings', and every quoted message in the client or `Info.plist`):
- Use keyboard shortcuts: the shortcut sheet, the command palette, sequences, changing shortcuts in **Settings** › **Keyboard shortcuts** (record, **Add**, **Replace**, per-platform profiles, **Reset all shortcuts**), and the generated reference table.
- Change your theme and sounds: **Dark theme** (never follows the system; per device; O then T), **Sound effects** with every **Task completed** and **Coach opens** choice from `sounds.ts`, Ramble cues not choosable, per device.
- Manage your account: photo (formats, square crop, **Remove**), no name/email/password change (write to support), linking Google, what is account vs device, **Log out**. No membership badge.
- Sync and working offline: live updates, 60 s polling, refetch on focus/reconnect, **Synced**/**Sync**, Mod+R, offline and unreachable banners, undone writes with **Retry**, nothing queued or cached for offline.
- Allow notifications and the microphone on Mac (`platforms: ["mac"]`): mic prompt text, **Open System Settings**, **Choose microphone**, Ritual notifications only.
- Troubleshoot sign-in: one `##` per message; forgotten password goes to support; one Web/Mac block for Google sign-in.
- What's new: intro plus `<ReleaseNotes />`.

Generated pages:
- `apps/docs/lib/shortcuts.ts` imports `packages/ramble/src/keyboard.ts` (relative import, no new dependency) and lists every command with `availability: "available"`, grouped as the app's sheet groups them, minus a short `UNDOCUMENTED` list (`navigation.ui` component gallery, `task.left`/`task.right` which the client doesn't wire, `general.dismiss`, `task.paste-file`). Excluded, planned, native and disputed commands never appear. Where the registry has a Mac-specific default (delete, first/last task, Upcoming today) each key style shows its own. `components/generated-content.tsx` renders `<ShortcutTable />` with the `Shortcut` component.
- `apps/docs/lib/releases.ts` re-exports `releases` from `apps/client/src/releases.ts` (the permitted read); `<ReleaseNotes />` renders every release.
- Both are registered in the article page's MDX components. `lib/generated-content.test.ts` renders both and fails if a shipped command's label or any release/highlight is missing, if an excluded command is listed, if an `UNDOCUMENTED` id no longer exists, or if the article stops embedding the component.
- Limitation: the help center's search indexes the MDX text, so the generated table rows and release notes are not searchable.

Shot added to `SHOTS`: `keyboard-shortcut-settings` (Settings › Keyboard shortcuts dialog), marked in "Use keyboard shortcuts". Not captured. Mac permission prompts and notifications would need hand captures; none requested (text is enough).

Links to unpublished articles in other categories (publish together or remove first): `/tasks-capture/use-quick-add`, `/tasks-capture/add-or-manage-multiple-tasks`, `/tasks-capture/dictate-tasks-with-ramble`, `/goals-seasons-rituals/introduction-to-rituals`, `/get-started/create-your-account-and-sign-in`, `/get-started/use-todalo-on-the-web-or-install-it-on-your-mac`, `/get-started/get-started-with-todalo`.

Mismatches between the app, the spec and itself:
1. Spec story 72 (change name, photo and password): only the photo can be changed; no password reset/change, no name or email change, no account deletion. The articles send readers to support.
2. The "Component gallery" (`navigation.ui`, O then C, `/ui`) is in the shipped client's shortcut sheet and command list; it's a design tool and is left out of the article. It should probably be dev-only.
3. `task.left`/`task.right` are registered as available but the client doesn't bind them; `general.dismiss` and `task.paste-file` are browser behaviour. Left out.
4. Shortcut labels mix spellings: "Customize shortcuts in your account" (American) and "Chat with coach about recommendation" (lower-case coach); the generated table quotes registry labels as they are.
5. The Mac app's product name is `todalo` (lower case), so System Settings lists **todalo**; the article bolds it as shown. The release title "The first todalo" is printed as is on What's new.
6. Ritual notifications are the only notifications, appear only while the app runs, and on Mac the click opens the Ritual via the next window focus (no click event from the plugin).
7. The offline banner says nothing is saved, and there is no offline cache: reloading offline shows nothing. The spec's "Sync and working offline" title may suggest more than exists.
8. Theme and sounds are per device (localStorage) while shortcuts are per account; the theme never follows the system setting (spec Theme note confirms this is intended).
9. The `ritual.season-review` note typo from ticket 10 is still in `keyboard.ts` (not user-visible).

Checks: docs tests 107/107, typecheck, lint, production build; in preview mode `/apps-account` and all seven article URLs return 200 (the shortcut table renders 136 rows, What's new lists 0.1.0); server stopped afterwards.

2026-11-11 — Published on the owner's request (`published: true`), merged to main.
