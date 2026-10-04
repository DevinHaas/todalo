# Shared Todalo client — account development slice

The browser, Mac and iOS shells share this React account screen. Today and other
product screens follow after ticket 2's physical-device acceptance. Email sign-in
and registration use the existing Better Auth account/session tables. No provider
OAuth has been added to this client.

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
Release builds require an explicit HTTPS origin and fail authentication closed
when none is configured. No native request follows redirects. Physical iPhone
development requires a reachable HTTPS API; loopback refers to the phone itself.

Native IPC exposes only `sign_in`, `sign_up`, `account`, and `sign_out` to the local
main webview. Rust reads and stores the signed session in Apple Keychain and
attaches bearer headers. There is no token getter, web storage fallback, or
general HTTP command. A failed server sign-out keeps the credential for retry;
user query caches are cleared when sign-out starts. Expired/revoked sessions are
removed after an account response returns 401.

## Isolated manual QA

Avoid production account/database changes. From this directory:

```sh
bun --no-env-file scripts/auth-smoke-server.ts
CLIENT_API_PROXY_TARGET=http://127.0.0.1:3009 bun run dev
```

The in-memory service seeds `existing@example.test` with `dev-password-123`.
All these records disappear on service restart. It imports no production DB or
auth singleton. Registration can create additional disposable QA accounts.

To build a local Mac app against that service:

```sh
TODALO_API_BASE_URL=http://127.0.0.1:3009 bun tauri build --debug --bundles app --ci
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
