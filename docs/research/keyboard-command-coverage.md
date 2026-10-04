# Keyboard command coverage

Registry: `apps/web/lib/keyboard.ts`. This matrix records the foundation integration; feature tickets update availability alongside their actual handlers. The live Settings list reads the registry directly and remains the authoritative release availability.

Source inventory: [verified Todoist research](todoist-keyboard-shortcuts-2026-10-03.md). Source disputes are retained in Notes. Browser-native, desktop, collaboration, mouse, text-token and mobile entries remain explicitly classified; they never enter browser dispatch.

Bindings use the produced character. Primary means Command on macOS and Control on Windows/Linux; explicit Control remains distinct. Context precedence is quick-add → editor → focused task → calendar/upcoming → project → view → global. Identical bindings in specialized contexts are valid only under that precedence; two handlers in the same context must own distinct visible scopes. The sequence interval is one second, chosen for Todalo.

| Stable action ID | Action | Context | macOS baseline | Windows baseline | Availability / stage | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `general.capture` | Capture task | global | q | q | available / 1 |  |
| `general.ramble` | Open Ramble | global | Meta+Shift+r | Ctrl+Shift+r | available / 1 | Todalo in-app voice capture; desktop global capture is excluded. |
| `general.sidebar` | Toggle sidebar | global | m | m | available / 1 |  |
| `general.help` | Show keyboard shortcuts | global | ? | ? | available / 1 |  |
| `general.dismiss` | Dismiss or cancel | editor | Escape | Escape | available / 1 |  |
| `general.search` | Search | global | / or f | / or f | available / 2 |  |
| `general.quick-find` | Quick Find | global | Meta+k | Ctrl+k | available / 2 |  |
| `view.toggle-nested` | Toggle nested tasks and sections | view | Meta+Alt+0 | Ctrl+Alt+0 | available / 2 | Declines while project sorting is active. |
| `navigation.home` | Home | global | h or g then h | h or g then h | removed | Removed at user request; absent from the registry, navigation, Help, and Settings. Old /home links redirect to Today. |
| `navigation.inbox` | Inbox | global | g then i | g then i | available / 2 |  |
| `navigation.today` | Today | global | g then t | g then t | available / 1 |  |
| `navigation.upcoming` | Upcoming | global | g then u | g then u | available / 1 |  |
| `navigation.labels` | Labels | global | g then l | g then l | available / 3 |  |
| `navigation.projects` | Projects | global | g then p | g then p | available / 2 |  |
| `navigation.sections` | Navigate sections | global | g then / | g then / | available / 2 |  |
| `navigation.filters` | Filters & Labels | global | g then v | g then v | available / 3 |  |
| `navigation.settings` | Settings | global | o then s | o then s | available / 1 |  |
| `navigation.help` | Help & resources | global | o then h | o then h | available / 1 |  |
| `navigation.account` | Account menu | global | o then u | o then u | available / 1 |  |
| `navigation.theme` | Toggle theme | global | o then t | o then t | available / 1 |  |
| `task.previous` | Previous task | view | k or ArrowUp | k or ArrowUp | available / 1 |  |
| `task.next` | Next task | view | j or ArrowDown | j or ArrowDown | available / 1 |  |
| `task.left` | Move focus left | view | ArrowLeft | ArrowLeft | available / 1 |  |
| `task.right` | Move focus right | view | ArrowRight | ArrowRight | available / 1 |  |
| `task.reveal` | Reveal task in project | task | Shift+g | Shift+g | available / 2 |  |
| `task.add-bottom` | Add task at bottom | view | a | a | available / 1 |  |
| `task.add-top` | Add task at top | view | Shift+a | Shift+a | available / 1 |  |
| `editor.submit-below` | Submit task and add below | quick-add | Enter | Enter | available / 1 |  |
| `editor.save-below` | Save edited task and add below | editor | Shift+Enter | Shift+Enter | available / 1 |  |
| `editor.save-above` | Save task and add above | quick-add | Ctrl+Enter | Ctrl+Enter | available / 1 |  |
| `editor.save` | Save task details | editor | Meta+Enter | Ctrl+Enter | available / 1 |  |
| `editor.previous` | Previous task while editing | editor | Meta+ArrowUp | Ctrl+ArrowUp | available / 1 |  |
| `editor.next` | Next task while editing | editor | Meta+ArrowDown | Ctrl+ArrowDown | available / 1 |  |
| `task.complete` | Complete task | task | e | e | available / 1 |  |
| `task.details` | Open task details | task | Enter | Enter | available / 1 |  |
| `task.edit` | Edit task | task | Meta+e | Ctrl+e | available / 1 |  |
| `task.date` | Choose date | task | t | t | available / 1 |  |
| `task.clear-date` | Clear date | task | Shift+t | Shift+t | available / 1 |  |
| `task.priority-1` | Set priority 1 | task | 1 | 1 | available / 3 |  |
| `task.priority-2` | Set priority 2 | task | 2 | 2 | available / 3 |  |
| `task.priority-3` | Set priority 3 | task | 3 | 3 | available / 3 |  |
| `task.priority-4` | Set priority 4 | task | 4 | 4 | available / 3 |  |
| `task.priority` | Choose priority | task | y | y | available / 3 |  |
| `task.labels` | Edit labels | task | l | l | available / 3 | Bulk picker replaces labels on all selected tasks. |
| `task.move` | Move task | task | v | v | available / 2 |  |
| `task.menu` | Task action menu | task | . | . | available / 1 |  |
| `task.select` | Select focused task | task | x | x | available / 1 | Windows web omits X; desktop documents it. Todalo adopts the documented desktop binding. |
| `task.toolbar` | Focus selection toolbar | task | , | , | available / 1 |  |
| `task.delete` | Delete selected tasks | task | Meta+Backspace | Shift+Delete | available / 1 |  |
| `task.copy-url` | Copy task URL | task | Meta+Shift+c | Ctrl+Shift+c | available / 3 | Owned canonical task route; visible clipboard access errors and manual link fallback. |
| `task.nest` | Nest task | task | Ctrl+] | Ctrl+] | available / 2 | Explicit Control on macOS; use a custom binding on layouts without dedicated brackets. |
| `task.unnest` | Unnest task | task | Ctrl+[ | Ctrl+[ | available / 2 |  |
| `task.toggle-children` | Toggle child tasks | task | Shift+e | Shift+e | available / 2 |  |
| `view.layout` | Switch layout | view | Shift+v | Shift+v | available / 4 |  |
| `project.section` | Create section | project | s | s | available / 2 |  |
| `project.sort-date` | Sort by date | project | d | d | available / 2 | Uses web project baseline D; macOS sorting subsection contradicts with Option+D. |
| `project.sort-priority` | Sort by priority | project | p | p | available / 3 | Web project baseline; macOS Option+P entry is disputed. |
| `project.sort-name` | Sort by name | project | n | n | available / 2 | Web project baseline; macOS Option+N entry is disputed. |
| `project.menu` | Project action menu | project | w | w | available / 2 |  |
| `view.first` | First task | view | Meta+ArrowUp | Ctrl+Home | available / 2 |  |
| `view.last` | Last task | view | Meta+ArrowDown | Ctrl+End | available / 2 |  |
| `upcoming.today` | Upcoming: go to today | upcoming | Alt+Shift+y | Home | available / 4 |  |
| `upcoming.next-week` | Upcoming: next week | upcoming | Shift+ArrowRight | Shift+ArrowRight | available / 4 |  |
| `upcoming.previous-week` | Upcoming: previous week | upcoming | Shift+ArrowLeft | Shift+ArrowLeft | available / 4 |  |
| `calendar.today` | Calendar: go to today | calendar | t or Alt+Shift+y | t | available / 4 | Windows Option+Shift+Y is unresolved and not silently adapted. |
| `calendar.next-week` | Calendar: next week | calendar | Shift+ArrowRight | Shift+ArrowRight | available / 4 |  |
| `calendar.previous-week` | Calendar: previous week | calendar | Shift+ArrowLeft | Shift+ArrowLeft | available / 4 |  |
| `task.paste-file` | Paste file as a task | project | Meta+v | Ctrl+v | available / 4 | Native file paste in the active project/default page focus; custom bindings require Clipboard API permission and may expose only images without original filenames. |
| `quick-add.description` | Reveal description | quick-add | ArrowDown | ArrowDown | available / 3 | Scoped to the composing task name input. |
| `quick-add.actions` | Reveal additional actions | quick-add | Shift+ArrowDown | Shift+ArrowDown | available / 3 | Scoped to the composing task name input. |
| `quick-add.deadline` | Choose deadline while composing | quick-add | { | { | available / 3 | Scoped command; existing text syntax parsing is unchanged. |
| `task.deadline` | Choose deadline | task | d | d | available / 3 | Changelog default; actual task focus or selection in the collection takes precedence over project sorting. |
| `task.clear-deadline` | Clear deadline | task | Shift+d | Shift+d | available / 3 |  |
| `native.print` | Print view | global | Meta+p | Ctrl+p | native / 0 | Preserved browser behavior; customization is unavailable. |
| `native.zoom-in` | Increase zoom | global | Meta+= | Ctrl+= | native / 0 | Preserved browser behavior; customization is unavailable. |
| `native.zoom-out` | Decrease zoom | global | Meta+- | Ctrl+- | native / 0 | Preserved browser behavior; customization is unavailable. |
| `native.zoom-reset` | Reset zoom | global | Meta+0 | Ctrl+0 | native / 0 | Preserved browser behavior; customization is unavailable. |
| `native.focus-next` | Advance focus | global | Tab | Tab | native / 0 | Preserved browser behavior; customization is unavailable. |
| `native.focus-previous` | Reverse focus | global | Shift+Tab | Shift+Tab | native / 0 | Preserved browser behavior; customization is unavailable. |
| `native.history-back` | Browser history back | global | Meta+[ | Alt+ArrowLeft | native / 0 | Preserved browser behavior; customization is unavailable. |
| `native.history-forward` | Browser history forward | global | Meta+] | Alt+ArrowRight | native / 0 | Preserved browser behavior; customization is unavailable. |
| `excluded.reporting` | Reporting | global | g then a | g then a | excluded / 0 |  |
| `excluded.productivity` | Productivity | global | o then p | o then p | excluded / 0 |  |
| `excluded.notifications` | Notifications | global | o then n | o then n | excluded / 0 |  |
| `excluded.comments` | Task comments | global | c | c | excluded / 0 |  |
| `excluded.assignee` | Choose assignee | global | Shift+r | Shift+r | excluded / 0 |  |
| `excluded.share` | Share project | global | Shift+s | Shift+s | excluded / 0 |  |
| `excluded.sort-assignee` | Sort by assignee | global | r | r | excluded / 0 |  |
| `excluded.insights` | Project Insights | global | i | i | excluded / 0 |  |
| `excluded.project-comments` | Project comments | global | c | c | excluded / 0 |  |
| `excluded.global-capture` | Desktop global capture | global | Alt+Space | Ctrl+Space | excluded / 0 | Native desktop capability; see research for Windows and legacy alternatives. |
| `excluded.global-voice` | Desktop global voice capture (new installs) | global | Alt+Shift+r | Alt+Shift+r | excluded / 0 | Native desktop capability; see research for Windows and legacy alternatives. |
| `excluded.global-voice-legacy` | Desktop global voice capture (existing installs) | global | Alt+Shift+Space | Alt+Space | excluded / 0 | Native desktop capability; see research for Windows and legacy alternatives. |
| `excluded.window-toggle` | Show/hide desktop window | global | Meta+Ctrl+t | Meta+Ctrl+t | excluded / 0 | Native desktop capability; see research for Windows and legacy alternatives. |
| `excluded.window-duplicate` | Duplicate desktop window | global | Meta+Shift+n | Ctrl+Shift+n | excluded / 0 | Native desktop capability; see research for Windows and legacy alternatives. |
| `excluded.window-home` | New desktop Home window | global | Meta+Alt+Shift+n | Ctrl+Alt+Shift+n | excluded / 0 | Native desktop capability; see research for Windows and legacy alternatives. |
| `excluded.window-pin` | Keep desktop window above others | global | Meta+Alt+f | Ctrl+F11 | excluded / 0 | Native desktop capability; see research for Windows and legacy alternatives. |
| `disputed.windows-calendar` | Windows calendar Option+Shift+Y | calendar | Alt+Shift+y | Alt+Shift+y | disputed / 0 | Source prints Option; this alternative is not enabled. |
| `excluded.recurring-archive` | Complete and archive recurring task (Shift+Click) | global | — | — | excluded / 0 |  |
| `excluded.mouse-edit` | Edit with Option/Alt+Click | global | — | — | excluded / 0 |  |
| `excluded.mouse-select` | Toggle selection with Command/Control+Click | global | — | — | excluded / 0 |  |
| `excluded.mouse-multiselect` | Select multiple tasks with modifier/Shift+Click | global | — | — | excluded / 0 |  |
| `syntax.priority` | p1–p4 priority tokens | quick-add | — | — | excluded / 0 | Text parsing is separate from keyboard customization; existing parsing is preserved. |
| `syntax.project` | #project token | quick-add | — | — | excluded / 0 | Text parsing is separate from keyboard customization; existing parsing is preserved. |
| `syntax.section` | /section token | quick-add | — | — | excluded / 0 | Text parsing is separate from keyboard customization; existing parsing is preserved. |
| `syntax.assignee` | +assignee token | quick-add | — | — | excluded / 0 | Text parsing is separate from keyboard customization; existing parsing is preserved. |
| `syntax.label` | %label and legacy @label tokens | quick-add | — | — | excluded / 0 | Text parsing is separate from keyboard customization; existing parsing is preserved. |
| `syntax.reminder` | !time reminder token | quick-add | — | — | excluded / 0 | Text parsing is separate from keyboard customization; existing parsing is preserved. |
| `syntax.deadline` | {date} deadline token | quick-add | — | — | excluded / 0 | Text parsing is separate from keyboard customization; existing parsing is preserved. |
| `syntax.date` | Natural-language date, time and recurrence | quick-add | — | — | excluded / 0 | Text parsing is separate from keyboard customization; existing parsing is preserved. |
| `mobile.capture` | Mobile capture (Command/Control+N) | global | — | — | excluded / 0 | Separate mobile hardware-keyboard scope; source duplicates label/filter modifier+5. |
| `mobile.routes` | Mobile Inbox/Today/Upcoming (modifier+1/2/3) | global | — | — | excluded / 0 | Separate mobile hardware-keyboard scope; source duplicates label/filter modifier+5. |
| `mobile.lists` | Mobile list/label/filter navigation (modifier+4/5) | global | — | — | excluded / 0 | Separate mobile hardware-keyboard scope; source duplicates label/filter modifier+5. |
| `mobile.create` | Mobile project/label/filter creation (modifier+Shift+P/L/F) | global | — | — | excluded / 0 | Separate mobile hardware-keyboard scope; source duplicates label/filter modifier+5. |
| `mobile.search` | Mobile search (modifier+F) | global | — | — | excluded / 0 | Separate mobile hardware-keyboard scope; source duplicates label/filter modifier+5. |
| `mobile.settings` | Mobile settings (modifier+,) | global | — | — | excluded / 0 | Separate mobile hardware-keyboard scope; source duplicates label/filter modifier+5. |
| `mobile.sync` | Mobile synchronization (modifier+S) | global | — | — | excluded / 0 | Separate mobile hardware-keyboard scope; source duplicates label/filter modifier+5. |
| `mobile.top` | Android top task creation (Ctrl+Shift+N) | global | — | — | excluded / 0 | Separate mobile hardware-keyboard scope; source duplicates label/filter modifier+5. |
| `mobile.comment` | Android save comment (Ctrl+Enter) | global | — | — | excluded / 0 | Separate mobile hardware-keyboard scope; source duplicates label/filter modifier+5. |
| `mobile.urgent` | iOS urgent reminder (!time!) | global | — | — | excluded / 0 | Separate mobile hardware-keyboard scope; source duplicates label/filter modifier+5. |

The browser reservation list is conservative, not a guarantee that a browser or operating system will deliver every accepted combination. macOS sorting Option+D/P/N/R contradicts the web project baseline; web D/P/N are adopted, while assignee sorting stays excluded. Windows desktop Alt+E, desktop zoom-in Ctrl+Shift+=, Windows calendar Option+Shift+Y, desktop-only X, and source mobile label/filter modifier+5 contradictions are not claims of exact cross-platform parity. Desktop show/hide Windows Win+Alt+S is excluded along with macOS Command+Control+T.

Extension: mount `useKeyboardCommands` in the active feature with an `enabled` flag or DOM `scope`, then mark its registry action available. Use `allowInEditor`/`allowInModal` only for explicitly scoped editor actions. Handler return `false` leaves the browser event untouched. Hints use `ShortcutHint` or `useKeyboard().bindings(id)`, and help uses effective saved preferences. Preference snapshots preserve the prior effective set when changing defaults introduces conflicts; explicit disabled sets stay empty.
