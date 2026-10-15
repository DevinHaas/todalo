# Shared Todalo client — account development slice

The browser, Mac and iOS shells share this React client: account screens, the app
sidebar shell, a read-only Today list and task detail (ticket 3). Email sign-in
and registration use the existing Better Auth account/session tables. Google
sign-in and account linking (ticket 4) go through the system browser.

## Run against your development API

From the repository root, start the existing API with `bun run --filter @todalo/api dev`.
Set `AUTH_TRUSTED_ORIGINS=http://localhost:5173` for both server hosts in development
while preserving the existing `BETTER_AUTH_URL`, secret and database. Multiple
trusted origins are comma-separated **exact** HTTP(S) origins. Do not use wildcards.

From this directory run `bun run dev`. Browser `/api` requests are proxied to
`http://127.0.0.1:3001`, overridden through `CLIENT_API_PROXY_TARGET`.
Production browser hosting must proxy `/api/auth/*` and `/api/v1/*` to Elysia
under the browser's origin and retain the legacy Google callback URLs. Ticket 25
owns deployment/cutover. Vite is a development server, not the production API.

For Mac development, add `$HOME/.cargo/bin` to PATH and run `bun tauri dev`.
`TODALO_API_BASE_URL` is a compile-time public native API origin. Debug builds
default to `http://127.0.0.1:3001`; debug HTTP is accepted only for loopback.
**iOS builds must use `TAURI_TODALO_API_BASE_URL` instead**: `tauri ios build|dev`
compiles Rust from an Xcode phase that only receives the Tauri CLI's forwarded
`TAURI*`/`WRY*`/`CARGO_*`/`RUST_*` variables (a `.cargo/config.toml` `[env]` entry
is not picked up there either). `build.rs` accepts either name, rejects empty or
conflicting values, and the iOS `beforeBuildCommand` fails if only the
unforwarded name is set. Check a build with `strings <app>/todalo | grep 127.0.0.1:30`.
Release builds require an explicit HTTPS origin and fail authentication closed
when none is configured. No native request follows redirects. Physical iPhone
development requires a reachable HTTPS API; loopback refers to the phone itself.

Native IPC exposes only `sign_in`, `sign_up`, `account`, and `sign_out` to the local
main webview. Rust reads and stores the signed session in Apple Keychain and
attaches bearer headers. There is no token getter, web storage fallback, or
general HTTP command. A failed server sign-out keeps the credential for retry;
user query caches are cleared when sign-out starts. Expired/revoked sessions are
removed after an account response returns 401.

## Google sign-in and linking (ticket 4)

- **Browser:** Better Auth's own `POST /api/auth/sign-in/social` and
  `/link-social` with `callbackURL` back to the initiating page
  (`?google=signed-in|linked|failed`, stripped on return). The session arrives as
  the usual HttpOnly cookie; the legacy `/api/auth/callback/google` is unchanged.
- **Native:** `google_start { intent }`, `google_finish`, `google_cancel` (in
  `src-tauri/src/oauth.rs`; the webview never sees a URL, code or token). Rust
  creates a 32-byte verifier and state, calls `POST /api/auth/native-oauth/begin`
  (bearer-authenticated for `link`), keeps `{state, verifier, intent, expiry}` in
  Apple Keychain, and opens the returned `/api/auth/native-oauth/authorize` URL in
  the **system browser** (Safari/default browser via the opener plugin; not a
  webview). That endpoint runs Better Auth's normal Google state/callback; then
  `/native-oauth/complete` (in the same browser) issues a 2-minute single-use code
  and shows a "Return to todalo" page that opens
  `app.todalo.client://oauth/callback?state=…&code=…` (or `&error=cancelled|not_linked|already_linked|failed`).
  Rust accepts it only for the pending state, deletes the pending flow before any
  network call, and exchanges `{code, verifier}` at `/native-oauth/exchange` for a
  signed session stored straight into Keychain. Replayed, forged or stale links
  are ignored; codes are consumed even on a wrong verifier.
- **Server:** `packages/auth/src/native-oauth.ts` is a Better Auth plugin, so both
  hosts that mount `auth.handler` (legacy Next and Elysia) serve it beside the
  existing Google callback. Attempts live 10 minutes, codes 2 minutes, both in
  the Better Auth `verification` table and consumed atomically. The browser
  session created by the Google callback is revoked before the code is issued.
- **Accounts are never merged silently:** Better Auth refuses implicit linking to
  an unverified email/password account (`not_linked`); the user signs in with the
  password and links Google from the account screen instead.
- **Deep links:** only the `app.todalo.client` scheme for `oauth/callback` is
  registered (`plugins.deep-link` in `tauri.conf.json`; CFBundleURLTypes in the
  generated iOS Info.plist). No task routes.

## Authenticated reads (ticket 3 conventions)

- **API:** `GET /api/v1/today` → `{ tasks: TaskDto[], openCount }` and
  `GET /api/v1/tasks/:id` → `{ task: TaskDto }` (`apps/api/src/task-routes.ts`).
  The user is always the session's (cookie or bearer); missing and other users'
  IDs both return `404 { code: "NOT_FOUND", message }`; no session is
  `401 { code: "UNAUTHENTICATED", message }`. Responses are `no-store`.
- **DTOs:** `packages/server/src/task-dto.ts` allow-lists fields; every date is an
  ISO-8601 UTC string or `null`, rendered in the viewer's local zone (legacy
  semantics). The client imports only its types.
- **Native:** each read is one fixed IPC command (`today`, `task { id }` in
  `src-tauri/src/reads.rs`) calling `NativeAuth::read(path)`. Add a new command
  per new read; never a path-taking or general HTTP command. IDs are validated
  in Rust before URL construction. Rust error strings must match `src/errors.ts`.
- **Query cache:** keys start with `["user", userId]` (`taskKeys` in
  `src/tasks.ts`); logout/account change clears the cache. Any `UNAUTHENTICATED`
  query error triggers `session.refresh()`, which signs out when the server agrees.
  Mutations (ticket 5) must invalidate `taskKeys.today(userId)` (it also feeds the
  sidebar count) and the affected `taskKeys.task(userId, id)`.
- **Routes:** React Router `/today`, `/tasks/:id`, `/account`; unknown paths go to
  `/today`. Signed-out screens keep the URL so the route opens after sign-in.

## Isolated manual QA

Avoid production account/database changes. From this directory:

```sh
bun --no-env-file scripts/auth-smoke-server.ts
CLIENT_API_PROXY_TARGET=http://127.0.0.1:3009 bun run dev
```

The in-memory service seeds `existing@example.test` with `dev-password-123`, plus
fixture Today tasks and a second user's private task (`/tasks/other-private`) for
cross-user checks. `QA_EMPTY_TODAY=1` starts it with no tasks for the seeded user.
All these records disappear on service restart. It imports no production DB or
auth singleton. Registration can create additional disposable QA accounts.
Google is faked (`apps/api/src/fake-google.ts`): authorization redirects go to a
local consent page at `/api/fake-google/authorize` (consent as
`google-qa@example.test`, as `existing@example.test`, or cancel) and the token
endpoint returns an unsigned ID token. Real Google is never contacted.

To build a local Mac app against that service:

```sh
TODALO_API_BASE_URL=http://127.0.0.1:3009 bun tauri build --debug --bundles app --ci
# iOS simulator: note the TAURI_ prefix
TAURI_TODALO_API_BASE_URL=http://127.0.0.1:3009 bun tauri ios build --debug --target aarch64-sim --ci
```

The resulting app lives under `src-tauri/target/debug/bundle/macos/todalo.app`.
It uses bundled assets. This is a local unsigned development artifact; no release
has been signed, notarized or published.

## Apple project and verification

The provisional identifier `app.todalo.development` is only for development;
it makes no claim to a registered domain or App Store identifier. Choose the
release identifier after Apple membership is active. No team ID is committed.
The generated `src-tauri/gen/apple` project is checked in without build products.
`bun tauri ios init --ci --skip-targets-install` can regenerate it after toolchain
setup; the CLI may install XcodeGen and mobile-device utilities using Homebrew.
Set `APPLE_DEVELOPMENT_TEAM` only after selecting the actual enrolled team.

Current **candidate**, unverified minimum targets: macOS 12 and iOS 15.4.
Only arm64 Mac and arm64 iOS-simulator compilation have evidence so far.
Physical iPhone and signed Mac session/lifecycle validation remain required.
See [ticket 2 evidence](../../docs/qa/tauri-account-auth.md).

```sh
bun run test
bun run typecheck
bun run build
cd src-tauri
cargo test --locked
cargo check --locked --target aarch64-apple-ios-sim
# Manual OS test: unique synthetic credential, removed before returning.
cargo test --locked apple_keychain_round_trip_and_removal -- --ignored
```
