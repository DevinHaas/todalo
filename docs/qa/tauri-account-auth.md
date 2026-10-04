# Ticket 2 — shared account and native auth evidence

Date: 2026-10-04. Status: **in progress; physical-device acceptance pending**.

## Implemented behavior

`apps/client` supplies the same React email/password sign-in, existing registration
flow, and account identity screen to browser, macOS and iOS. It bundles the Geist
font and preserves the existing login form's typography, spacing and colors.
Touch controls have a 44px minimum and safe-area padding. No Today interface or
provider OAuth has been migrated in this ticket.

Both the legacy Next handler and Elysia use the same `@todalo/auth` instance,
database adapter, cookie names, secret and account/session records. The Elysia
host now mounts `/api/auth/*`; legacy callback URLs stay in place. The installed
Better Auth bearer plugin requires signed credentials. Account responses contain
only user identity and session expiry, with `Cache-Control: no-store` and a fresh
session lookup that bypasses cookie cache.

Browser calls use relative `/api` URLs with same-origin HttpOnly cookies. Native
Rust commands send explicit bearer credentials from Apple Keychain; they do not
use webview cookies or its origin. The browser's cookie CSRF/origin protection
remains enabled. Development browser origins must be listed explicitly through
`AUTH_TRUSTED_ORIGINS`; wildcards and non-origin URLs are rejected. Native requests
use HTTPS, allow loopback HTTP only in debug, and never follow redirects.

Native IPC returns account identity, never session tokens or auth response bodies.
Only four account commands are granted to the local main webview; no remote
capability, HTTP plugin, filesystem/store plugin or logging plugin is granted.
Keychain keys are scoped by development service and API origin. macOS uses the
OS-protected login Keychain with app access control; iOS uses device-only,
when-unlocked Keychain protection. Neither store synchronizes credentials to
iCloud. Storage failure fails authentication closed; it never falls back to files
or localStorage. Failed server logout keeps the credential for an explicit retry.
Expiry/revocation clears it on an authenticated account 401.

User query caches clear at sign-in, account switch, session loss and logout.
Generation checks prevent stale account reads restoring signed-out identity;
foreground refresh cannot race and discard an in-flight authentication result.
The UI retains form drafts after recoverable failure, clears prior-mode errors,
and checks sessions on foreground and at the reported expiry time.

## Passed automated checks

- **10 focused TypeScript tests** through the real installed Better Auth handler,
  signed bearer plugin, official memory adapter and Elysia routes, plus client
  session/cache boundaries. Coverage includes registration, existing-account
  sign-in, cookie compatibility, safe account DTO, signed vs unsigned/malformed
  credentials, expiry, server logout revocation, hostile/missing cookie origins,
  cross-site login, stale-read races, account-switch cache clearing and logout retry.
- `@todalo/api`, `@todalo/auth`, `@todalo/client` typechecks pass.
- Shared browser production build passes and bundles frontend assets/fonts.
- Rust macOS `cargo check --locked` and `cargo test --locked` pass. Two endpoint
  policy tests cover release HTTPS and debug loopback restrictions.
- The explicitly run ignored `apple_keychain_round_trip_and_removal` test passed
  against this Mac's real unlocked Keychain. It used a unique synthetic value and
  removed it before returning. This proves the OS adapter, not signed-app lifecycle.
- `cargo check --locked --target aarch64-apple-ios-sim` passes, including iOS-only
  Keychain accessibility code.

Tests and the smoke service use isolated memory account/session records and test
secrets. No production users or database records were modified.

## Browser walkthrough

Parent browser review at `http://localhost:5173`, with the isolated API on 3009:
existing account sign-in, account identity, reload persistence, logout, invalid
login with safe error/input retention, registration, logout plus reload all passed.
At 390 × 844 the document width remained 390 with no horizontal overflow.
Screenshots: [account](tauri-account-browser.jpg), [mobile login](tauri-login-mobile.jpg).

Review caught an old sign-in error persisting after switching to registration;
the error now clears while draft fields stay. It also caught React root duplication
during HMR; the root entry and App refresh boundary are now separate and the root
disposes on replacement. Parent revalidation is recorded in the migration progress
file.

## Native artifacts and toolchain

Observed host: arm64 macOS 26.6.2; Xcode 26.0.1 build 17A400, iOS SDK 26.0;
Rust/Cargo 1.99.0; Bun 1.3.9; Node 26.7.0. JavaScript Tauri API/CLI and Rust
Tauri resolve to 2.12.1; Vite 8.3.2, React 19.2.4, TanStack Query 5.104.1,
security-framework 3.7.0. Both lockfiles are committed and Rust is pinned in
`rust-toolchain.toml`. iOS arm64/device and simulator Rust targets were installed.
The CLI generated the Apple project and installed/reinstalled XcodeGen 2.46.0
and libimobiledevice 1.4.0_1 with its required Homebrew dependencies. No tap trust
or unrelated account configuration was changed.

Local **unsigned debug Mac** build succeeded:

```sh
TODALO_API_BASE_URL=http://127.0.0.1:3009 bun tauri build --debug --bundles app --ci
```

Artifact: `apps/client/src-tauri/target/debug/bundle/macos/todalo.app`, 39.14 MiB.
It bundles the shared UI and targets the isolated QA service. Native app login,
relaunch/logout and signed identity validation still require the device walkthrough.

Unsigned **iOS simulator archive** build succeeded:

```sh
TODALO_API_BASE_URL=http://127.0.0.1:3009 bun tauri ios build --target aarch64-sim --debug --no-sign --archive-only --ci
```

Artifact: `apps/client/src-tauri/gen/apple/build/todalo-client_iOS.xcarchive`.
Its embedded `todalo.app` reports `DTPlatformName=iphonesimulator` and contains
a Mach-O arm64 executable. It was compiled/archived, not installed or exercised
on a physical phone. Generated project sources are checked in; build products
and static libraries are ignored. No Apple development team is committed.

## Decisions and open acceptance

App identity stays **Todalo**. `app.todalo.development` is an explicit provisional
development identifier, not a registered release identifier or domain claim.
Candidate minimums are macOS 12 and iOS 15.4; only the observed host and arm64
simulator compile have evidence. Intel Mac and minimum-OS support remain unverified.

The user selected Individual Apple enrollment under their legal name. Membership
is not active yet; see [enrollment guidance](apple-developer-enrollment.md).
Earlier `security find-identity -v -p codesigning` returned zero valid identities
and `devicectl list devices` timed out initializing CoreDeviceService. iOS tooling
also warned that an actual development team must be selected; none was inferred
from cached Xcode accounts.

Before marking ticket 2 complete, select the actual enrolled team and release
identifiers, establish a reachable HTTPS test API, sign/install development builds
on the physical iPhone and Mac, and record login/registration, account identity,
app relaunch, Keychain persistence, remote expiry/revocation, logout/relaunch,
account cache clearing, safe-area/keyboard and denial/failure recovery evidence.
Lock the support matrix after those checks. Tickets blocked by ticket 2 remain
blocked. No signing, notarization, publication or release claim was made here.

## Sources consulted

[Better Auth bearer plugin](https://better-auth.com/docs/plugins/bearer),
[Elysia Better Auth integration](https://elysiajs.com/integrations/better-auth),
[Tauri Vite integration](https://v2.tauri.app/start/frontend/vite/),
[Tauri configuration](https://v2.tauri.app/reference/config/),
[Tauri capabilities](https://v2.tauri.app/security/capabilities/),
[Apple Keychain Rust adapter](https://docs.rs/security-framework/latest/security_framework/passwords/index.html),
[Keychain protection modes](https://docs.rs/security-framework/latest/security_framework/access_control/enum.ProtectionMode.html),
[TanStack QueryClient](https://tanstack.com/query/latest/docs/reference/QueryClient).
Installed Next authentication and Turbo README/task/env/package-config guides
were read before applicable changes. Installed Better Auth source confirmed the
signed-token and CSRF behavior used by the tests.
