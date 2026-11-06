# Tauri migration: proposed ticket breakdown

Source: [migration specification](tauri-migration-spec.md).
Status: implementation started on 4 October 2026 on `codex/tauri-migration`; tickets are published in [the local tracker](../.scratch/tauri-migration/issues/).

The local Markdown tracker has one file per ticket, initially marked `ready-for-agent`. A ready ticket is eligible for implementation only when all its blockers are complete. Ticket status and evidence are recorded in those files; hardware requirements remain acceptance gates.

Each feature ticket includes its required API/contracts, shared server operations, shared React interface, platform adaptations and behavioral validation. Extract just the server operations needed for that feature before adding the new caller; retain legacy wrappers until retirement. Do not create separate “all APIs” and “all screens” tickets. Existing ADR decisions on recurrence, Ramble staging/commit and semantic processing remain in force.

Ticket 1 is a bounded prefactor and baseline exception. Tickets 10, 26, 27 and 28 are verifiable integration/release gates. All other tickets deliver a narrow user flow. Hardware/signing prerequisites are acceptance requirements, not fictitious blocker tickets.

## Proposed tickets

1. **Preserve Today behavior while separating its server query**
   **Blocked by:** None.
   **What it delivers:** The existing Today page behaves identically while its authenticated task query becomes reusable by a second client.
   **Acceptance:** Preserve ownership and date semantics with regression coverage; capture deterministic desktop/mobile visual baselines and an operation inventory for the whole migration; assign each inventoried capability to a proposed ticket and record current test failures. No broad mutation extraction.

2. **Sign into an installed Todalo app and keep the session**
   **Blocked by:** 1.
   **What it delivers:** A user signs in with an existing email/password account or creates an account using the existing name/email/password registration flow in the shared browser, iPhone and Mac client, sees their account identity, relaunches successfully and signs out.
   **Acceptance:** Introduce the minimum shared Vite/Tauri shell and account screen; preserve email registration and validate registration failures; prove native credential storage, session expiry/revocation and cache clearing; preserve browser cookie auth and legacy sessions; verify origin/CSRF behavior. Install development builds on physical iPhone and Mac and record Apple identity/toolchain/support-matrix decisions. No provider OAuth yet.

3. **Read Today and open a task across all three clients**
   **Blocked by:** 2.
   **What it delivers:** The signed-in user sees their actual Today list and a read-only task detail using the existing visual design.
   **Acceptance:** Reuse the shared query and explicit date DTOs; implement navigation, loading/empty/error states and the initial query-cache conventions; preserve basic sidebar layout, typography and fonts; reject cross-user reads. Compare screenshots and verify safe areas and software-keyboard layout where applicable.

4. **Sign in with Google and return safely to the app**
   **Blocked by:** 2.
   **What it delivers:** Google sign-in and account linking return to the initiating browser, iPhone or Mac session without losing existing accounts.
   **Acceptance:** Use system authorization UI with a verifier/state-bound, expiring, single-use handoff; verify cold/warm app return, cancellation, expiry and replay rejection; keep Google/session credentials out of URLs and logs; preserve server callback compatibility. Includes deep-link registration needed for auth, not every task route.

5. **Create, complete and delete a basic task**
   **Blocked by:** 3.
   **What it delivers:** A user adds a nonrecurring task, sees it in Today or Inbox, completes it or deletes it, and sees the result in the legacy web app.
   **Acceptance:** Extract only these server operations and reuse them from both transports; preserve validation, authorization, existing calendar side effects and cache/count updates; test ambiguous create/completion responses using operation IDs before enabling retries; retain input on failure. Rich editing and recurrence controls follow in ticket 11.

6. **Record and transcribe a short Ramble session on Apple devices**
   **Blocked by:** 2.
   **What it delivers:** The user starts a short recording in the installed app and sees real transcription from the existing Ramble service.
   **Acceptance:** Prove microphone permissions, sample conversion and ordered audio transport; choose and test authenticated native WebSockets or one-use socket tickets without weakening browser checks; stop/recover visibly on interruptions and permission denial. Add a native audio adapter only if the web capture cannot meet the requirement. Task staging/commit remains ticket 21.

7. **Feel optional feedback when completing a task**
   **Blocked by:** 5.
   **What it delivers:** Completing a task on iPhone produces standard haptic feedback that the user can disable, with safe behavior on web and Mac.
   **Acceptance:** Add a semantic feedback adapter and persisted opt-out; unsupported/failed feedback never fails the task operation; verify on a physical iPhone and with reduced motion. Preserve existing transitions without adding Rive or custom AHAP patterns.

8. **Create and open projects in the shared client**
   **Blocked by:** 3.
   **What it delivers:** The user lists, creates, renames and deletes projects and opens their existing tasks.
   **Acceptance:** Preserve project data, deletion semantics, ownership and navigation counts in both clients; migrate the project routes and required server operations; test existing task membership and empty/error states. Sections and task moves follow separately.

9. **Add a file to a project and retrieve its attachment**
   **Blocked by:** 8.
   **What it delivers:** A user creates a file-backed task in a project and opens/downloads its attachment from browser, iPhone and Mac.
   **Acceptance:** Preserve stored bytes, metadata, upload limits and task ownership; prove native authenticated upload/download, cancellation and errors without disabling existing protections; validate iPhone file selection and Mac paste/drag/drop. Include relaunch and existing-attachment compatibility checks.

10. **Verify the native feasibility slice before broad migration**
    **Blocked by:** 4, 6, 7, 9.
    **What it delivers:** One documented walkthrough demonstrates that Todalo can sign in, manipulate tasks, transfer files, record audio and provide feedback on the actual target devices.
    **Acceptance:** Record device/OS/build evidence and resolve auth/storage/audio failures; freeze the initial support matrix, auth transport and callback decisions; verify the legacy site still works. Approval of this gate unlocks broad feature migration; it is not a framework reconsideration ticket.

11. **Edit task details, dates and recurring schedules**
    **Blocked by:** 10.
    **What it delivers:** The user edits existing task details and schedules, completes recurring tasks and gets the correct next occurrence.
    **Acceptance:** Preserve the recurrence ADR, timezone/date serialization and calendar-write behavior; reuse authoritative rules from legacy and new transports; test invalid input, recurrence retry deduplication and stale/error states; keep dialogs and task detail synchronized. Labels and organization actions are separate tickets.

12. **Use smart quick-add and save date-recognition preferences**
    **Blocked by:** 11.
    **What it delivers:** Natural-language quick-add and its highlighting/date recognition work as today, and the setting survives restart/account reload.
    **Acceptance:** Reuse parsing and highlighting decisions from existing ADRs; preserve detected and overridden dates/recurrence; provide a working settings control and failure recovery; verify keyboard and touch entry.

13. **Organize tasks into sections and subtasks**
    **Blocked by:** 11.
    **What it delivers:** Users create/delete sections, move tasks between destinations and manage task parents from the shared interface.
    **Acceptance:** Preserve hierarchy and organization invariants, transaction behavior and ownership; verify destination lists, invalid cycles/cross-project relationships, sidebar/view invalidation and legacy compatibility. Provide touch-accessible actions in addition to desktop gestures.

14. **Use labels and saved filters**
    **Blocked by:** 11.
    **What it delivers:** Users create/edit/delete labels, assign task labels and open/save/delete their existing saved filters.
    **Acceptance:** Preserve filter definitions and label relationships; expose the existing metadata editor behavior; update affected task lists/counts; test cross-user IDs and deleted-label/filter states. Bulk assignment is ticket 15.

15. **Reorder tasks and apply bulk actions**
    **Blocked by:** 13, 14.
    **What it delivers:** Users select tasks, reorder them and apply existing bulk completion/deletion/date/metadata/move actions.
    **Acceptance:** Preserve sort/status semantics and transactional validation; prevent duplicate effects on retry; verify keyboard, touch and drag/drop behavior and visible failed/partial-result handling; keep all affected queries synchronized.

16. **Plan work in Upcoming and schedule views**
    **Blocked by:** 11.
    **What it delivers:** Users navigate Upcoming, task calendar and daily/weekly schedule views using the current design.
    **Acceptance:** Preserve date grouping, task positioning, time ranges and view preferences; verify date boundaries and daylight-saving cases; test desktop/touch controls and task edits flowing back to all views. Provider event overlay is added in ticket 20.

17. **Switch project layouts and use board interactions**
    **Blocked by:** 15.
    **What it delivers:** Project list/board layouts, view switching and task status movement work across platforms.
    **Acceptance:** Preserve current display preferences, ordering and task membership; verify touch and mouse interactions plus accessible alternatives; regression-test drag cancellation and failed mutations. Use the operations already delivered by earlier slices.

18. **Find tasks and reopen task links**
    **Blocked by:** 14.
    **What it delivers:** Users search their tasks and open existing task URLs from inside or outside the app.
    **Acceptance:** Preserve current search semantics and route destinations; support cold/warm links and post-login continuation; validate untrusted/unknown routes, unauthorized task IDs and browser refresh fallback. Search and routing do not require the later release-hosting cutover.

19. **Use and customize keyboard commands**
    **Blocked by:** 12, 17, 18.
    **What it delivers:** Existing keyboard navigation/edit commands and account shortcut preferences work in the browser and Mac app, with touch alternatives on iPhone.
    **Acceptance:** Preserve shortcut recording, conflicts, focus/dialog behavior and account settings; verify Mac reserved keys, selection and editable fields; test VoiceOver and prevent inaccessible essential actions. Baseline keyboard accessibility remains required in all earlier tickets.

20. **Manage connected calendars and see live provider updates**
    **Blocked by:** 16.
    **What it delivers:** Users see their existing calendar events, change account/calendar visibility, resync and disconnect accounts, and receive updates after provider changes.
    **Acceptance:** Migrate settings, event queries, webhooks and streaming as one feature; preserve registered callback URLs and credentials; keep process-local publishers/subscribers together or prove shared fan-out; authenticate native streaming and refetch on resume. Verify visibility, disconnected accounts and legacy calendar behavior end to end.

21. **Turn a full Ramble session into tasks**
    **Blocked by:** 12, 13.
    **What it delivers:** Users record, review, revise and commit staged Ramble tasks into their selected project/parent context.
    **Acceptance:** Preserve staging/commit and semantic-processing ADRs, undo/review behavior and existing settings; make retries nonduplicating; recover from connection/audio interruption without claiming unsaved work succeeded; verify physical-device latency and cleanup. Reuse the feasibility audio path.

22. **Recover from connection loss and reflect other-device changes**
    **Blocked by:** 19, 20, 21.
    **What it delivers:** Users see accurate connection state, retain drafts after failures and see changes from another device after foregrounding/reconnecting or the defined polling interval.
    **Acceptance:** Exercise all migrated mutation categories, including attachments and bulk actions; stop polling in the background, clear account caches and handle stale edits explicitly; do not introduce offline writes or automatic unsafe retries. Basic failure handling and deduplication must already ship with each feature.

23. **Prepare an installable iPhone release candidate**
    **Blocked by:** 22.
    **What it delivers:** A release-mode iPhone build can be installed and upgraded with the intended distribution configuration.
    **Acceptance:** Validate signing, identifiers, permissions, icons, privacy metadata, bundled assets/CSP, environment separation and compatibility messages; test install/update/relaunch and previous supported API behavior; prepare TestFlight delivery materials. Actual upload/publication requires release authorization.

24. **Prepare an installable Mac release candidate**
    **Blocked by:** 22.
    **What it delivers:** A signed/notarized Mac candidate installs, launches and upgrades on the declared supported architectures.
    **Acceptance:** Validate native window behavior, signing/notarization, entitlements, microphone use, environment configuration, bundled assets/CSP and API compatibility; test install/update/relaunch; document direct-distribution steps. No updater or Mac App Store expansion is required.

25. **Stage the new browser deployment and rehearse rollback**
    **Blocked by:** 22.
    **What it delivers:** The shared browser client works on a staging deployment with deep-link refreshes, API proxying and unchanged provider callbacks, and can be rolled back without losing user data.
    **Acceptance:** Deploy server additions before client routing changes; exercise fallback exclusions for assets/APIs; verify legacy and installed-client compatibility; define the supported API/client window and rollback window; retain the previous web build and prove non-destructive rollback.

26. **Sign off cross-platform parity and release readiness**
    **Blocked by:** 23, 24, 25.
    **What it delivers:** The release candidates have a complete pass/fail record against the original feature inventory and visual baseline.
    **Acceptance:** Close unmapped/missing features; run physical-device lifecycle, VoiceOver, reduced-motion, ownership/auth replay and multi-device checks; inspect client bundles for server dependencies/secrets and permissions; document intentional visual differences and blockers. No release readiness declaration while critical cases are unverified.

27. **Roll out the Apple pilot and shared browser client**
    **Blocked by:** 26.
    **What it delivers:** Authorized testers receive the iPhone/Mac apps and the browser client is cut over with monitoring and rollback available.
    **Acceptance:** Obtain required release authorization before external publication or production routing changes; execute the approved distribution stages, including App Store release when authorized; verify account/data/calendar/attachment continuity and record pilot outcomes; retain compatible backend and legacy rollback deployment through the agreed window.

28. **Retire the legacy Next client after the rollback window**
    **Blocked by:** 27.
    **What it delivers:** Todalo has one maintained frontend implementation for browser, iPhone and Mac.
    **Acceptance:** Confirm successful pilot/sign-off and expired rollback window; inventory all remaining legacy consumers before deleting Next screens, wrappers and obsolete build dependencies; preserve callback URLs and supported installed clients; rerun shared-client/API regression checks and update deployment/developer instructions. No destructive data migration.

## Review questions

- Is this granularity right, too coarse or too fine?
- Do the blockers reflect genuine dependencies, or should a branch start earlier?
- Which tickets should be merged or split?

The feasibility gate intentionally holds back broad migration. After it passes, editing/planning, organization, calendar and Ramble work can branch where the actual dependencies allow. The feature slices own their own tests; the final gate integrates the evidence rather than postponing all verification until the end.

Custom haptic patterns, new animated characters, offline synchronization and additional operating systems remain outside this migration ticket set, as specified.
