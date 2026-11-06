# Todalo Tauri migration — agent handoff

Updated: 5 October 2026. Continue the existing migration to one shared React client
for web, macOS and iOS, packaged natively with Tauri 2. “Tower application” in the
handoff request refers to this Tauri migration.

**Scope update (22 October 2026):** the user chose **Mac + browser first**.
iPhone is deferred; it may later reuse this Tauri client or be written natively
in Swift against the same `/api/v1`. Tickets 07 (haptics) and 23 (iPhone
release) are deferred, and physical-iPhone/iOS-simulator checks no longer gate
tickets 02–22 or 26. Keep API and auth choices mobile-compatible.

## Start here

1. Work in `/Users/devinhasler/.codex/worktrees/tauri-migration/todalo`, branch
   `codex/tauri-migration`. Implementation/evidence checkpoint: `5f5acac`.
   The worktree was clean before this handoff was added. Check current status
   before editing; preserve any newer changes.
2. Keep `/Users/devinhasler/projects/todalo` on its existing branch
   `codex/keyboard-support`. Its untracked research documents and `scripts/loop.sh`
   belong to the original checkout and were preserved.
3. Read [migration specification](tauri-migration-spec.md), then
   [ticket proposal](tauri-ticket-proposal.md). Individual execution tickets live
   in `.scratch/tauri-migration/issues/`. A `ready-for-agent` label does not waive
   its **Blocked by** dependencies.
4. Resume **ticket 2 acceptance** before starting ticket 3. Finish the signed
   hardware evidence below and update the ticket/evidence files. Membership
   purchase, unsigned compilation and simulator execution alone cannot close it.

## User instructions and implementation workflow

- Use a separate, lean sub-agent for each implementation ticket. Give it the
  ticket, relevant paths, file ownership and acceptance criteria; avoid handing
  every agent the entire history. Agents share files: preserve others' changes.
- Keep migration work isolated on the branch/worktree above. Reuse it rather
  than creating a competing migration checkout.
- The user invoked `/Users/devinhasler/.agents/skills/implement/SKILL.md`: use TDD
  at meaningful seams, run focused tests/typechecks during implementation, run
  the full suite at completion, review and commit the work.
- Follow applicable `AGENTS.md`. Read installed Next documentation before Next
  edits and the installed Turbo docs before Turbo configuration/command changes.
  Final status indicators follow the quick-recap skill.
- Preserve existing behavior and design. Production cutover/publication is a
  later ticket; the legacy Next client remains available during migration.

## Completed work

**Ticket 1 is complete.** `packages/server/src/today.ts` contains the reusable
Today query; legacy callers use it. Seven regressions cover ownership, dates,
DST and midnight behavior. A deterministic fixture supplies desktop/mobile
baseline captures; an operation inventory maps existing behavior to the tickets.
These screenshots establish a fixture baseline, not live authenticated UI parity.

**Ticket 2 code is implemented; acceptance remains in progress.**

- `apps/client` supplies Vite/React and Tauri 2 shells with email signup, sign-in,
  account identity and sign-out. `apps/api/src/auth-routes.ts` exposes shared
  Better Auth/account endpoints through Elysia. Existing account tables and
  legacy browser sessions are reused.
- Browser auth uses cookies. Native Rust transport stores the signed session in
  Apple Keychain and attaches bearer headers. IPC is restricted to `sign_in`,
  `sign_up`, `account`, `sign_out`; tokens are not exposed to JavaScript or web
  storage. Keep HTTPS origin validation, disabled redirects, origin/CSRF checks,
  cache clearing and safe error handling intact.
- Browser QA passed sign-in, registration, reload persistence, logout/reload,
  invalid-credential input retention and a 390 × 844 layout check against an
  isolated memory API. Native Mac QA proved Keychain restoration after true
  process exit and signed-out state after logout/quit/relaunch.
- Cargo checks/tests, a synthetic Keychain write/read/delete and unsigned
  Mac/iOS-simulator builds passed. Independent standards/spec review found
  three P2 issues; all were fixed and re-reviewed.

Evidence and runnable setup are in [progress report](qa/tauri-migration-progress-2026-10-04.md),
[account/native evidence](qa/tauri-account-auth.md), [client README](../apps/client/README.md),
[baseline](qa/tauri-baseline.md), [operation inventory](qa/tauri-baseline-inventory.md)
and [review record](../.scratch/tauri-migration/review.md).

## Immediate blocker: Apple membership and hardware acceptance

The user has no registered company. After considering Organization enrollment,
they explicitly chose **Individual enrollment under their legal name**. Bleat is
a desired brand; the application remains Todalo. Do not restart the organization
or D-U-N-S discussion unless the user changes that decision.

Latest observed enrollment state: the user signed in; Apple's
`https://developer.apple.com/enroll/purchase` showed **CHF109 for one year**, with
automatic renewal unchecked. The agent opened the checkout and gave guidance;
**payment and membership activation have not been confirmed**. Recheck the
current account state rather than assuming that checkout is still open. Any
payment or binding agreement must follow the applicable action-time approval
policy; the user can complete it themselves.

After activation:

1. Confirm the enrolled Team ID and agree the final bundle identifier with the
   user. Current `app.todalo.development` is provisional; no team is committed.
2. Configure the Apple account and development signing identity in Xcode; use
   `APPLE_DEVELOPMENT_TEAM` for the actual team. See
   [enrollment guide](qa/apple-developer-enrollment.md).
3. Establish physical iPhone availability and a reachable development HTTPS API.
   `127.0.0.1` on the phone is the phone itself, not the Mac.
4. Install signed development builds on physical iPhone and Mac. Record
   device/OS/build identity and verify the ticket's login, registration,
   persistence, logout, expiry/revocation, cache clearing, recovery failures,
   lifecycle, safe-area/software-keyboard and support-matrix requirements.
5. Close ticket 2 only when its acceptance is evidenced. Then assign ticket 3,
   “Read Today and open a task across all three clients,” to its own sub-agent.

Last toolchain observations: Xcode 26.0.1 (17A400), cargo 1.99.0, arm64 Mac
`Mac17,8` on macOS 26.6.2; no valid signing identities at the initial check.
`xcrun devicectl list devices` timed out initializing CoreDeviceService; device
availability remains unknown. Candidate minimums macOS 12/iOS 15.4 are
**unverified**. Reinspect current targets, certificates and devices when resuming.

## Reproduce development QA

Use [client README](../apps/client/README.md) for real development API setup,
trusted origins and production proxy requirements. For disposable auth QA, from
`apps/client` run these in separate terminals:

```sh
bun --no-env-file scripts/auth-smoke-server.ts
CLIENT_API_PROXY_TARGET=http://127.0.0.1:3009 bun run dev
```

Seed account: `existing@example.test` / `dev-password-123` (disposable memory
service only). Records disappear on restart; it imports no production database.
To rebuild a local Mac QA bundle from `apps/client`:

```sh
TODALO_API_BASE_URL=http://127.0.0.1:3009 bun tauri build --debug --bundles app --ci
```

`TODALO_API_BASE_URL` is compiled into the native app. Release builds require an
explicit HTTPS origin. Use a reachable HTTPS endpoint for physical iPhone QA.
Prior temporary QA services were stopped and the Mac app logged out and quit.

Local ignored artifacts, which may need rebuilding:

- `apps/client/dist/`: shared browser bundle.
- `apps/client/src-tauri/target/debug/bundle/macos/todalo.app`: 39.14 MiB debug
  prototype with bundled assets and QA API port 3009; linker ad hoc signature,
  no enrolled TeamIdentifier. It is not a signed release installer.
- `apps/client/src-tauri/gen/apple/build/todalo-client_iOS.xcarchive`: unsigned
  arm64/iphonesimulator archive, not an IPA, physical-device or TestFlight build.

## Verification checkpoint and remaining scope

At checkpoint `5f5acac`, root `bun run test` passed **30 files / 301 tests**;
`bun run typecheck` passed **seven workspaces**; `bun run build` passed legacy
Next, Vite client and Elysia API. Cargo format/check/test and simulator compilation
passed. Rerun relevant checks after changes; recorded results are not new runs.

`bun run lint` had three preexisting `react-hooks/set-state-in-effect` errors:
`apps/web/components/tasks/task-composer.tsx:77` and `:622`, and
`apps/web/hooks/use-mobile.ts:14`. They were reproduced in the original checkout;
those files and lint configuration were unchanged from the migration base.

Tickets 3–28 remain outstanding and follow their dependency graph. The shared
client currently has the account slice; Today/task screens and native Google
OAuth are not implemented there. Ticket 10 requires evidence for the native
feasibility slice before broad migration. Release candidates, browser staging,
rollback rehearsal, parity sign-off, rollout and legacy retirement remain later
tickets. Preserve these gates and report actual acceptance evidence.
