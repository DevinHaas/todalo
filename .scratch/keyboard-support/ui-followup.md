# Shortcut UI follow-up

Implemented the three browser comments from October 4, 2026, on `codex/keyboard-support`.

- Removed keyboard shortcut annotations throughout the ordinary app UI, including sidebar, view controls, menus, dialogs, composer, and calendar controls. Action labels and keyboard functionality remain. Keys are still displayed in Help and Settings.
- Added a search field to Help. It searches action names, groups, and readable effective key names, resets when reopened, and receives initial focus. Empty results, Escape dismissal, and focus restoration are retained.
- Redesigned Settings using compact divided rows, clickable binding pills, Add icons, and rotating-arrow Restore icons. Assigned, Custom, Unassigned, and conflict filters work. Removing every binding leaves an action unassigned; there is no separate Disable/Enable state.
- Preserved account synchronization, drafts/save/cancel, platform defaults, and conflict validation. Fixed platform-only restoration when an older all-platform override exists.
- Simplified recording after the next browser comment: only the selected inline pill says “Press hotkey…”. The first complete key or chord sets the draft and stops recording immediately. There is no recording panel or Finish/Clear/Cancel recording toolbar. Modifier-only, repeated, and composing events keep waiting; clicking away or leaving the window cancels. Existing sequence bindings continue to work.

Validation: the initial UI redesign passed 26 test files / 276 tests and web typecheck; focused lint found only the two pre-existing composer effect errors. The later simplified recorder passed 22 focused tests, web typecheck, and scoped lint. Parent review confirms the capture-once guard and listener cleanup. The annotation audit and whitespace checks are clean. The local server remains available.

Browser automation was blocked by the browser URL security policy, so no new live browser interaction or visual verification is claimed for this follow-up. Refresh the running app to review the layout and test the controls. No production build, database migration, or account preference mutation was needed.

Main implementation: [Settings](../../apps/web/components/keyboard/shortcut-settings.tsx), [Help](../../apps/web/components/keyboard/keyboard-provider.tsx), [search/filter behavior](../../apps/web/lib/keyboard-search.ts).

## iPad sidebar access

Below 768px, the sidebar switches to a closed drawer. Its only opener was inside that hidden drawer, leaving the 726px view without reachable navigation.

The [app header](../../apps/web/app/(app)/layout.tsx) now includes a 44px sidebar button below the same breakpoint. The shared [trigger](../../apps/web/components/ui/sidebar.tsx) reports the correct drawer/desktop expanded state, and [sidebar navigation](../../apps/web/components/app-sidebar.tsx) closes the drawer after selecting a route. Desktop behavior and the existing drawer focus handling are preserved.

Web typecheck, scoped lint, 14 focused tests, server-render smoke checks, and whitespace checks pass. Compiled CSS confirms the opener appears below 768px and hides at desktop widths. Source/CSS checks covered 390/726/768/1024/1394px; these are not live browser layout assertions. Browser interaction verification remains blocked by the existing URL-security restriction. Refresh the app at the iPad width to test opening and closing navigation.

## Home removal

Home was introduced by the earlier personal organization stage of keyboard support, which included Todoist's Home navigation. At the user's request, its page content, sidebar entry, keyboard handler, and registry action are removed. The former `/home` route now redirects to Today so existing tabs and links remain usable.

Legacy saved Home assignments are discarded when preferences are read or saved, including platform overrides and previous effective snapshots. Other assignments and their validation are preserved. The coverage matrix records the removal.

Validation: 24 focused keyboard tests, web typecheck, scoped lint, and whitespace checks pass. The local app responds at `/home`; live browser visual verification remains unavailable under the existing browser URL restriction.

## Commit verification

Before committing the combined UI follow-up, the full suite passed 27 test files / 281 tests. Web typecheck and scoped lint passed for the changed components and helpers; the composer change only removes annotations and retains its previously documented baseline lint errors. Whitespace checks pass. The unrelated untracked `scripts/loop.sh` is excluded.
