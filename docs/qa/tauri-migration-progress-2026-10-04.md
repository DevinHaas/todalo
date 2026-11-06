# Tauri migration progress — 4 October 2026

Branch: `codex/tauri-migration`.
Isolated workspace: `/Users/devinhasler/.codex/worktrees/tauri-migration/todalo`.
Starting commit: `e6b21cb245574d50ce78fca1c59da97610c142f8`.

The source checkout remains on its existing branch. Its untracked research files and `scripts/loop.sh` were left in place. The migration specification and proposal were copied into this worktree and committed with 28 individual tickets in `.scratch/tauri-migration/issues/`.

## Execution

Each implementation ticket has its own agent. Ticket 1 is complete in commits `bcaf034` and `b5013ea`: shared Today query, seven regression tests, reproducible desktop/mobile captures and the operation inventory mapped across all 28 tickets. Ticket 2's account shell and native sessions are implemented in `26457f1` and `2b9d83d`, including preserved email registration. Its acceptance remains in progress for signing and physical-device checks. Separate standards/spec reviews found three P2 issues across the two tickets; all are fixed and re-reviewed. See [baseline evidence](tauri-baseline.md), [inventory](tauri-baseline-inventory.md), [account/native evidence](tauri-account-auth.md) and [review](../../.scratch/tauri-migration/review.md). Later tickets remain subject to their recorded blockers; signed hardware validation and the native feasibility gate are required before broad migration.

## Initial validation

- Isolated dependencies: `bun install --frozen-lockfile --ignore-scripts` succeeded.
- Pre-change tests after dependency setup: 27 files, 281 tests passed.
- Pre-change `bun run typecheck`: all five workspaces passed.
- Pre-change API build: passed.
- The initial dependency symlink caused eight test-file resolution failures for `@todalo/ramble`; installing independent workspace dependencies resolved them. These were setup failures, not application regressions.

## Browser account validation

The shared Vite shell was exercised in the Codex in-app browser against an isolated in-memory Better Auth API on port 3009, proxied by Vite on port 5173. No live account database was used.

- Existing QA account signs in and shows its identity.
- Reload preserves the cookie session and account identity.
- Logout clears identity; reload remains signed out.
- Invalid credentials show a safe error and preserve the entered form values.
- Name/email/password registration creates a disposable account and opens its account screen.
- A 390 × 844 browser viewport has no horizontal overflow (content width 390px).
- [Account screenshot](tauri-account-browser.jpg) and [mobile login screenshot](tauri-login-mobile.jpg) record browser evidence; they do not establish WKWebView, native credentials, software-keyboard or signed-device acceptance.

Two small UI/dev issues were repaired and rechecked: the previous sign-in error clears on switching to registration while the screenshot visibly retains the email and nonempty password; an entry-module hot-reload trigger produces no new React root errors. CUA's read-only DOM representation did not expose live input values to an equality check, so draft retention was verified visually rather than inferred from that check.

## Local Mac development walkthrough

The debug bundle at `apps/client/src-tauri/target/debug/bundle/macos/todalo.app` was launched using native app automation against the isolated in-memory API on port 3009. Host model: `Mac17,8`; macOS `26.6.2`; executable architecture: arm64. `codesign -dv` reports a linker ad hoc signature and no TeamIdentifier, rather than an Apple Developer team identity.

- Existing QA account signs in through native Rust transport and displays its identity at `tauri://localhost`.
- Quit through the native menu and verify zero matching native processes.
- Relaunch restores the account without re-entering credentials, exercising actual Keychain persistence across process exit.
- Sign out, quit again, and verify zero processes; relaunch shows Sign in, exercising saved-session cleanup.
- [Native account screenshot](tauri-account-mac.jpg) records the successful account screen.
- The final temporary app run was closed after logout; no live database was used.

This is local development evidence, not a team-signed installer/update test, physical iPhone test, or release-readiness declaration. Native Keychain denial, device expiry/revocation, software-keyboard and supported OS/architecture cases remain subject to ticket 2's acceptance gate. The safe Keychain/configuration recovery-message review finding is repaired and re-reviewed in `2b9d83d`; the final bundle was rebuilt after the walkthrough.

## Final verification and artifacts

- `bun run test`: 30 files / 301 tests passed, including seven Today and thirteen account/session regressions.
- `bun run typecheck`: all seven workspaces passed.
- `bun run build`: legacy Next web, shared Vite browser client and Elysia API passed. No temporary baseline route appears in the production route list.
- Native Cargo format/check/test and simulator compilation passed; a real synthetic Keychain round trip removed its test credential before returning.
- A string scan of the browser build found no database/server package or server-secret markers. This is a scoped build check, not a full security audit.
- `bun run lint`: three `react-hooks/set-state-in-effect` errors at legacy `task-composer.tsx:77`, `task-composer.tsx:622` and `hooks/use-mobile.ts:14`. The same errors were independently reproduced in the original checkout; both files and ESLint configuration are unchanged from the migration base.
- Browser build: `apps/client/dist/`.
- Mac development bundle: `apps/client/src-tauri/target/debug/bundle/macos/todalo.app` (39.14 MiB, bundled assets, isolated QA endpoint on port 3009).
- Unsigned iOS simulator archive: `apps/client/src-tauri/gen/apple/build/todalo-client_iOS.xcarchive`, confirmed arm64/iphonesimulator; this is not a physical-device IPA or TestFlight build.

The local bundle is an account-flow prototype. Run the isolated QA service to use this artifact, or rebuild against the intended development API following the [client setup guide](../../apps/client/README.md). Today and remaining screens follow only after ticket 2 acceptance. Temporary QA services and app/browser sessions are stopped after validation.

## Apple environment

- Xcode: 26.0.1, build 17A400.
- Rust: cargo 1.99.0; installed target `aarch64-apple-darwin`.
- `security find-identity -v -p codesigning`: zero valid signing identities.
- `xcrun devicectl list devices`: timed out initializing CoreDeviceService; no physical-device availability is established.
- The user has no Apple Developer membership or registered company and selected Individual enrollment under their legal name. Bleat remains a desired brand; app branding remains Todalo. Follow [the enrollment guide](apple-developer-enrollment.md); membership activation, team, final bundle identifier and physical iPhone availability remain open. Do not infer successful hardware validation from an unsigned build or simulator.

The migration cannot be declared release-ready until the specified signing, physical-device, lifecycle and parity checks are evidenced. Production routing and external publication remain separate release actions.
