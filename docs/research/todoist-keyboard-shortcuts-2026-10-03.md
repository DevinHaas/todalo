# Todoist keyboard shortcuts: research for Todalo

Research checked October 3, 2026. This is a factual design reference, not an implementation specification. It inventories official desktop/web bindings and separates mobile-only bindings, text syntax, mouse gestures, and native desktop capabilities. Action descriptions are paraphrased; key combinations are preserved.

## Sources and currency

| Source | Date visible on source | Purpose |
|---|---|---|
| [Official keyboard shortcut reference](https://www.todoist.com/help/todoist/features/use-keyboard-shortcuts-in-todoist-Wyovn2) | Updated September 29, 2026 | Primary inventory and platform tables |
| [Official Quick Add guide](https://www.todoist.com/help/todoist/features/use-task-quick-add-in-todoist-va4Lhpzz) | Updated September 1, 2026 | Input syntax, description navigation, global customization |
| [Official 2026 changelog](https://www.todoist.com/help/todoist/product-updates/2026-changelog-HD3jJAtLd) | Updated September 27, 2026 | Additional bindings absent from primary inventory |
| [Official desktop multi-window guide](https://www.todoist.com/help/todoist/features/introduction-to-todoist-multi-windows-on-desktop-H9by8jUOH) | No visible date found | Desktop feature scope |

The most recent source found is dated September 29, 2026. Todoist changes actively; the reference contains inconsistencies that need behavioral verification before claiming exact parity. No live Todoist browser session was used to test disputed bindings. The official inventory is the sole primary authority for many individual keys; cross-checks against Quick Add and the changelog confirm specific overlapping actions rather than every binding.

## Notation and scope

`+` means simultaneous keys. `then` means an ordered sequence. Capital letter labels generally identify the letter key; Shift appears separately when required. On macOS, `Ctrl` means Control, distinct from `Cmd`. Alternative bindings belong to the same action. Unless marked otherwise, the core inventory covers desktop web and the macOS/Windows apps. Exact sequence timeout, event phase, overlapping key presses, focus-versus-hover precedence, and input-method handling are not documented.

## General app actions

| Action | macOS web | Windows web |
|---|---|---|
| Capture task | `Q` | `Q` |
| Search | `/` or `F` | `/` or `F` |
| Dismiss or cancel | `Esc` | `Esc` |
| Toggle sidebar | `M` | `M` |
| Show shortcut help | `?` | `?` |
| Quick Find | `Cmd+K` | `Ctrl+K` |
| Print view | `Cmd+P` | `Ctrl+P` |
| Increase zoom | `Cmd+=` | `Ctrl+=` |
| Decrease zoom | `Cmd+-` | `Ctrl+-` |
| Reset zoom | `Cmd+0` | `Ctrl+0` |
| Toggle nested tasks/sections or workspace folders | `Cmd+Option+0` | `Ctrl+Alt+0` |

The last action requires no active sorting or grouping. Windows desktop lists `Ctrl+Shift+=` for zoom-in. Reset zoom appears in the web table but is omitted from desktop-specific tables.

## Navigation

| Action | Binding |
|---|---|
| Reveal task in its project | `Shift+G` |
| Advance task-view focus | `Tab` |
| Reverse task-view focus | `Shift+Tab` |
| Previous item | `K` or `↑` |
| Next item | `J` or `↓` |
| Horizontal focus | `←` or `→` |
| Home | `H` or `G then H` |
| Inbox | `G then I` |
| Today | `G then T` |
| Upcoming | `G then U` |
| Labels | `G then L` |
| Projects | `G then P` |
| Section navigation | `G then /` |
| Reporting | `G then A` |
| Filters and Labels | `G then V` |
| Productivity | `O then P` |
| Help | `O then H` |
| Notifications | `O then N` |
| Account menu | `O then U` |
| Settings | `O then S` |
| Theme | `O then T` |

Desktop history: macOS `Cmd+[` / `Cmd+]`; Windows `Alt+←` / `Alt+→`. These are omitted from the web-specific navigation table. The 2026 changelog also extends `Shift+G` to task-detail view in addition to list views; the date of that individual entry was not separately verified.

## Task creation and inline editing

| Action/context | Binding |
|---|---|
| Start task at list bottom | `A` |
| Start task at list top | `Shift+A` |
| Submit new task and begin one below | `Enter` |
| Save edited task and begin one below | `Shift+Enter` |
| Save new/edited task and begin one above | `Ctrl+Enter`, including macOS Control |
| Paste file as a task in a project | macOS `Cmd+V`; Windows `Ctrl+V` |

File paste creates a task named after the file and attaches it; listed in the web table. Inline creation is a different context from task-detail editing, which also uses `Ctrl+Enter` on Windows.

## Focused/selected task actions

The primary reference places these in project, filter, and label views. Editing actions apply in their relevant editor context.

| Action | Shared binding or macOS / Windows |
|---|---|
| Complete task | `E` |
| Open task details | `Enter` |
| Edit | `Cmd+E` / `Ctrl+E` |
| Save detail edits | `Cmd+Enter` / `Ctrl+Enter` |
| Close details | `Esc` |
| Choose date | `T` |
| Clear date | `Shift+T` |
| Set priority directly | `1`, `2`, `3`, `4` |
| Choose priority | `Y` |
| Comments | `C` |
| Labels | `L` |
| Assignee | `Shift+R` |
| Move task | `V` |
| Action menu | `.` |
| Select focused task | `X`, documented for macOS and Windows desktop |
| Focus selection toolbar | `,` |
| Delete selection | macOS `Cmd+Delete` (`⌫`); Windows `Shift+Delete` |
| Copy task URL | `Shift+Cmd+C` / `Shift+Ctrl+C` |
| Previous task while editing | `Cmd+↑` / `Ctrl+↑` |
| Next task while editing | `Cmd+↓` / `Ctrl+↓` |

### Keyboard and mouse gestures

| Gesture action | Binding |
|---|---|
| Complete and archive recurring task | `Shift+Click` checkbox |
| Edit using mouse | macOS `Option+Click`; Windows web `Alt+Click` |
| Toggle individual selection | macOS `Cmd+Click`; Windows `Ctrl+Click` |
| Select multiple tasks | Platform modifier above or `Shift+Click` |

These are not keyboard-only commands and need a separate scope decision for customization.

## Subtasks

List layout and a focused task are required.

| Action | Binding |
|---|---|
| Nest task | `Ctrl+]` |
| Unnest task | `Ctrl+[` |
| Toggle child tasks | `Shift+E` |

macOS uses Control, not Command. Todoist explicitly warns that indentation needs dedicated `[` and `]` keys. Many non-English layouts access these through modifiers and therefore cannot use the default bindings. Customization can address this limitation.

## Project actions and sorting

| Action | Binding |
|---|---|
| Switch layout | `Shift+V` |
| Create section | `S` |
| Share project | `Shift+S` |
| Sort by date | `D` |
| Sort by priority | `P` |
| Sort by name | `N` |
| Sort by assignee | `R` |
| Project action menu | `W` |
| Toggle Insights | `I` |
| Project comments | `C` |
| List start/end, macOS desktop | `Cmd+↑` / `Cmd+↓` |
| List start/end, Windows desktop | `Ctrl+Home` / `Ctrl+End` |

The sorting subsection instead lists macOS `Option+D/P/N/R`; the project subsection lists plain `D/P/N/R`. This is an unresolved contradiction. Calendar layout requires Pro/Business. Project comments `C` comes from July 2, 2026 changelog. Insights `I` is confirmed July 9 and requires Insights enabled for the project.

## Upcoming and calendar

| Context/action | macOS | Windows |
|---|---|---|
| Upcoming: today | `Option+Shift+Y` | `Home` |
| Upcoming: next/previous week | `Shift+→` / `Shift+←` | Same |
| Calendar: today | `T` or `Shift+Option+Y` | Article prints `T` or `Shift+Option+Y` |
| Calendar: next/previous week | `Shift+→` / `Shift+←` | Same |

Windows calendar's `Option` entry is unresolved; do not silently substitute Alt. Calendar's platform selector lists web and macOS, despite a Windows column in its web table. Calendar availability is plan-dependent.

## Desktop global shortcuts

| Action | macOS | Windows |
|---|---|---|
| Capture task outside foreground app | `Option+Space` | `Ctrl+Space` |
| Voice capture, new installs | `Option+Shift+R` | `Alt+Shift+R` |
| Voice capture, existing installs | `Shift+Option+Space` | `Alt+Space` |
| Show/hide Todoist | `Cmd+Ctrl+T` | `Win+Alt+S` |

These work while Todoist is minimized. Global Quick Add and Ramble are explicitly unsupported on Linux. Ordinary browser pages cannot implement these native global capabilities on their own.

Todoist documents changing global shortcuts in Settings → Desktop. For Quick Add, clear the previous binding and record a replacement. Existing Ramble bindings persist through upgrades; users can switch to the newer default. May 14 changelog records expanded allowed keys for desktop global bindings without enumerating all accepted combinations.

The official documentation does not establish universal in-app customization or whether global customizations synchronize between devices. Universal rebinding is an additional Todalo requirement, not verified Todoist behavior.

## Native desktop windows

| Action | macOS | Windows |
|---|---|---|
| Duplicate current view in a window | `Shift+Cmd+N` | `Shift+Ctrl+N` |
| New Home window | `Shift+Option+Cmd+N` | `Shift+Alt+Ctrl+N` |
| Keep window above others | `Option+Cmd+F` | `Ctrl+F11` |

## Quick Add navigation and input syntax

Text tokens are parsed inside task input. They are distinct from application keybindings.

| Detail | Typed syntax |
|---|---|
| Priority | `p1`, `p2`, `p3`, `p4` |
| Project | `#name` |
| Section | `/name` after selecting a project |
| Assignee | `+name`, requiring a shared project |
| Label | `%name` |
| Reminder | `!time` |
| Deadline | `{date}` |
| Date, time, recurrence | Natural-language input |

`@name` remains accepted for labels, but both the shortcuts and Quick Add pages plan retirement by the end of 2026. This differs from older cheat sheets.

Within Quick Add, `↓` reveals the description field (confirmed in Quick Add guide and August 20 changelog), `Shift+↓` reveals additional actions, and `{` opens deadline selection (August 20 changelog). These operate while typing; a universal rule suppressing every shortcut in inputs would break them.

## Additional current shortcuts from the changelog

March 5, 2026 adds deadline selection `D` and deadline removal `Shift+D` for web, macOS, Windows, and Linux. The primary shortcut inventory omits them. It does not explain exact precedence against project sorting `D`; this requires live behavior verification.

July 2 adds project comments `C`, July 9 confirms project Insights `I`, and August 20 adds Quick Add navigation described above.

## Mobile keyboard bindings excluded from desktop/web scope

The main page additionally has iOS/Android keyboard tables. Their distinct bindings include `Cmd/Ctrl+N` for capture, platform-modifier `1/2/3` for Inbox/Today/Upcoming, modifier `4/5` for list navigation, modifier `Shift+P/L/F` for project/label/filter creation, modifier `F` for search, modifier `,` for settings, and modifier `S` for synchronization. The source assigns labels and filters to the same modifier `5`, another ambiguous entry. Android additionally lists `Ctrl+Shift+N` for top-of-project task creation and `Ctrl+Enter` for comment saving. These are separate platform tables; do not import them into desktop defaults.

iOS also lists urgent-reminder syntax `!time!`, limited to Pro/Business. Mobile hardware-keyboard parity needs separate research and behavioral verification if included in future scope.

## Ambiguities and implementation decisions

1. macOS sorting differs between sorting and project subsections: `Option+D/P/N/R` versus plain letters.
2. Windows desktop edit lists `Alt+E`, while Windows web lists `Alt+Click` as its alternate gesture.
3. Windows web omits `X` in the selection row; Windows desktop includes it.
4. Windows desktop zoom-in adds Shift; web does not.
5. Windows Calendar prints Option, and its platform selector does not provide a separate Windows app table.
6. Enter, Ctrl+Enter, C, T, D, and macOS Cmd+arrows have context-dependent meanings; conflict checks must account for scope.
7. Native focus traversal, text editing, browser/system reserved combinations, IME composition, sequence timeouts, and focus/hover precedence need an explicit policy. Official docs do not specify their internals.
8. Exact parity for unsupported actions must be distinguished from creating the missing product features. Global shortcuts and native window control require desktop capabilities.
9. Decide whether all aliases, text syntax, and mouse modifiers belong to customization, or only application commands.
10. Decide whether user overrides sync by account, remain per device, or support different platform profiles. Todoist's official sources do not resolve this.

Research establishes the documented baseline. Before shipping a claim of exact Todoist behavior, verify disputed entries in the relevant live Todoist platform and record its version.
