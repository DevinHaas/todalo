# Tauri migration operation inventory

Recorded 4 October 2026 against the legacy Next application and Elysia Ramble API.
Ticket IDs refer to `docs/tauri-ticket-proposal.md` and `.scratch/tauri-migration/issues`.
Each row has a delivery owner; ticket 26 integrates ownership, visual and platform
validation for every row. Counts, invalidation, errors and accessibility ship with
their owning feature, not only at the final gate.

## Routes and embedded reads

| Route | Existing read/navigation boundary | Delivery / validation owner |
| --- | --- | --- |
| `/`, `/home` | Root/home redirects; authenticated session/layout | 2, 3; refresh fallback 18, 25 |
| `/login`, `/api/auth/[...all]` | Better Auth email/password login and new-account registration (`authClient.signUp.email`), Google sign-in/linking, session and logout | 2 owns registration delivery/validation alongside login; Google/native return 4 |
| App layout | Session, Today count, smart dates, Ramble projects, shortcut preferences, owned tasks/sections for navigation | 1 (Today count), 3 (bootstrap); 8, 12, 13, 19 |
| `/today` | All owned tasks/labels + open due/overdue count; provider events; list/board/schedule | 1 query; 3 screen; 16 schedule; 17 board; 20 events |
| `/inbox` | All owned tasks filtered by absent project; list/board/calendar | 5; 16, 17 layouts |
| `/upcoming` | Owned tasks/events and date grouping/calendar layout | 16; 20 events |
| `/projects` | Owned project list | 8 |
| `/projects/[id]` | Owned project, tasks and sections; task count; list/board/calendar | 8; 13 sections; 17 board |
| `/tasks/[id]` | `getOwnedTask`, metadata/editor data, owned attachment list; inaccessible ID handling | 11; 9 attachments; 18 external link routing |
| `/labels`, `/labels/[id]` | Owned metadata and tasks matching label ID | 14 |
| `/filters`, `/filters/[id]` | Saved filter metadata and `matchesSavedFilter` over owned tasks | 14 |
| `/search` | `getTasksForUser`; case-insensitive title/description query from search params | 18 |
| `/settings` | Inline DB reads: Google accounts, calendar settings, synced calendars; smart dates and shortcuts | 12, 19, 20 |
| `/api/attachments` POST | Authenticated multipart file-task creation; explicit origin validation | 9 |
| `/api/attachments/[id]` GET | Owned attachment bytes and content/disposition headers | 9 |
| `/api/tasks/[id]/attachments` GET | Owned task attachment metadata | 9 |
| `/api/calendar/webhook` POST | Google watch channel notification and sync | 20; registered path preservation 25, 28 |
| `/api/calendar/stream` GET | Authenticated SSE, process-local subscribe/notify | 20; foreground recovery 22 |
| `/api/ramble/health` GET | Elysia health/compatibility probe | 6; deployment monitoring 25, 27 |
| `/api/ramble/session` GET | Authenticated session/context bootstrap and availability | 6 |
| `/api/ramble/ws` WS | Authenticated origin-checked audio/session protocol | 6 transport; full workflow 21 |

## Mutations, services and interface capabilities

| Boundary / capability | Operations to preserve | Delivery / validation owner |
| --- | --- | --- |
| `lib/tasks.ts` → `@todalo/server/today` | User/project task read, owned labels, full Today collection, count; sort order | 1; API DTO and web/native read transport 3 |
| `getOwnedTask`, `getTaskEditorData` | Task details, organization and metadata context; cross-user resource IDs | 11 |
| `tasks/actions.ts` | `createTask`, `completeTask`, `deleteTask`: basic task, ownership, calendar writes | 5 |
| `tasks/actions.ts` | `updateTask`: title/description, priority, date/end date/deadline, status, recurrence | 11 |
| Recurrence completion | Advance recurrence, timezone/DST, next occurrence and provider event; retry deduplication | 11 |
| `bulkTaskAction` | Bulk complete/delete/clear-date and selection | 15 |
| `reorderTask` | Status and sort order, drag/mouse/touch failure recovery | 15; board behavior 17 |
| `projects/actions.ts` | `createProject`, `updateProject`, `deleteProject`; preserve task membership/deletion semantics | 8 |
| `organization.ts` | Owned projects/project/sections | 8, 13 |
| `projects/organization-actions.ts` | `getOrganizationDestinations`, `createSection`, `deleteSection`, `moveTasks`, `setTaskParent` | 13 |
| Parent/organization validators | Reject foreign resources, cycles, project/section mismatch; carry children on move | 13 |
| `tasks/metadata-actions.ts` | `getMetadata`, `createLabel`, `updateLabel`, `deleteLabel`, `saveFilter`, `deleteFilter` | 14 |
| Task-label helpers / editor metadata | Owned label assignment, replace links, priority/deadline/filter semantics | 14 (labels); 11 (priority/deadline) |
| `bulkTaskMetadata` | Bulk priority/deadline/labels; validation, transaction and affected views/counts | 15 |
| Quick add / date parser / highlighting | Smart recognized date/time/recurrence, override sync, Ramble context, keyboard/touch composer | 12 |
| `setSmartDateRecognitionEnabled`, `getSmartDateRecognitionEnabled` | Account-persisted date recognition preference | 12 |
| Display settings / switcher | Show completed, list/board/calendar switch, week/month, date navigation | 16 planning; 17 project board |
| Existing display placeholders | Inert grouping/sort/filter controls and disabled Goals/Reporting/More/help affordances; retain appearance, no invented backend | 3 shell; parity verification 26 |
| Search/navigation dialog | Tasks, projects, sections, encoded task URL/copy, post-login and cold/warm deep links | 18 |
| Keyboard registry/provider/recorder | Account load/save, portable/Mac profiles, conflicts/reserved keys, focus restore, task navigation/edit/selection, command help/search/reset | 19 |
| `attachments.ts` | `requireOwnedProject`, `requireOwnedTask`, `createFileTasks`, `listTaskAttachments`, `readAttachment`, limit/error mapping | 9 |
| File entry points | File input, project paste/drag/drop, cancellation, binary bytes/metadata/download | 9 |
| Calendar settings actions | `setCalendarVisible`, `setAccountShowEvents`, `resyncAccount`, `disconnectAccount` | 20 |
| Calendar services | Account list, synced calendars/events; `ensureCalendarSync`, `syncCalendar`, Google list/watch/stop; echo and visibility filtering | 20 |
| Calendar writes from tasks | `pushTaskToCalendar`, `deleteTaskFromCalendar`; preserve provider side effects | 5, 11; integrated provider validation 20 |
| Ramble capture/audio queue | Permission/device selection, sample conversion, frame order, cleanup and interruption | 6 |
| Ramble protocol/session | Connect/context/audio/messages, transcription, errors/close, auth and origin | 6 |
| Ramble staging/semantic processing | Review/remove/undo/revise staged todos, project/parent/date/recurrence context, semantic providers | 21 |
| `commitRambleTodos`, `prepareTaskRows` | Commit through server, date/timezone mapping, organization, deduplication and errors | 21 |
| Session/cache lifecycle | Email new-account registration, cookies/bearer current-user/logout/revoke, protected credential restart persistence; clear user caches | 2 owns registration creation/error/session checks; recovery 22 |
| Native external URL/deep-link transport | System authorization browser, state/verifier handoff and exact origins | 4 auth; 18 task links |
| Native feedback | Optional completion haptics; failure/no-op and reduced-motion behavior | 7 |
| Connection and app lifecycle | Resume/refocus/refetch, realtime reconnect, draft preservation/stale edits, background stop; no offline writes | 22 |

## Gates, packaging and release ownership

| Ticket | Inventory validation responsibility |
| --- | --- |
| 1 | Preserve Today query behavior, original test state, deterministic screenshots and this inventory |
| 2 | Bundled Vite/Tauri shells, email registration/login/session/credential feasibility, browser coexistence; preserve new-account registration before legacy retirement |
| 3 | Shared Today/bootstrap read endpoint and original responsive shell |
| 4 | Google/linking and auth callbacks/deep links |
| 5 | Basic task create/complete/delete and effect deduplication |
| 6 | Native microphone/audio and authenticated Ramble transport |
| 7 | Optional semantic haptic feedback |
| 8 | Project CRUD and owned reads |
| 9 | Authenticated file upload/download and native selection |
| 10 | Actual iPhone/Mac feasibility walkthrough; freeze support matrix and native choices |
| 11 | Rich task/date/recurrence editor and authoritative rules |
| 12 | Smart quick add and account preference |
| 13 | Sections/subtasks/destinations and ownership invariants |
| 14 | Labels/saved filters and relationships |
| 15 | Bulk/reorder and transactional validation |
| 16 | Upcoming/calendar/schedule and date boundaries |
| 17 | Board/layout preferences and accessible drag alternatives |
| 18 | Search and task deep-link routing |
| 19 | Keyboard customization/accessibility/focus |
| 20 | Calendar accounts, reads, webhooks and streaming together |
| 21 | Full Ramble staging/review/commit |
| 22 | Reconnect, drafts, cross-device refetch and account cache isolation |
| 23 | iPhone signing/install/upgrade, privacy permissions/assets/CSP, TestFlight materials |
| 24 | Mac signing/notarization/install/upgrade, architectures/window/entitlements |
| 25 | Staging/browser refresh fallback, API and callback routing, compatibility window/rollback |
| 26 | Every inventory row, baseline comparison, physical-device lifecycle/VoiceOver/reduced motion and bundle/secret audit |
| 27 | Authorized pilot/distribution/browser cutover and monitoring; preserve old deployment |
| 28 | Audit legacy consumers including registration, require ticket 2 new-account signup validation, retire Next wrappers/build assets after rollback window, keep callback/API compatibility |

No inventoried product operation is deferred to an unspecified ticket. Native
behavior not yet present in the legacy product is explicitly owned above. This
inventory records existing inert controls as appearance only; it does not make
them promised new features. New Rive assets, custom AHAP patterns, offline sync,
push/widgets/share extensions and Android/Windows remain outside this migration.
