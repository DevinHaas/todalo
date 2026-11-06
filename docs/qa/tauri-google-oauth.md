# Ticket 4 — Google sign-in and safe return evidence

Date: 2026-10-15. Status: **implemented; simulator and browser verified with a
fake Google; real Google, physical iPhone and Mac app return not yet verified.**

## Flow

See [apps/client/README.md](../../apps/client/README.md#google-sign-in-and-linking-ticket-4).
Browser clients use Better Auth's own social endpoints and return to the
initiating page. Native clients use the system browser, a Rust-held
verifier/state pair, and a single-use, 2-minute handoff code exchanged over the
API transport. Server pieces: `packages/auth/src/native-oauth.ts` (Better Auth
plugin: `begin`, `authorize`, `complete`, `exchange` under `/api/auth/native-oauth`).
Native pieces: `apps/client/src-tauri/src/oauth.rs` and three IPC commands.

## Automated checks (all passing)

- `apps/api/src/native-oauth.test.ts` (11): app link carries only `state` + `code`
  and no session/Google token; browser keeps no session; exchange returns a signed
  bearer accepted by `/api/v1/account`; code replay, wrong verifier (burns the
  code), authorize/complete reuse rejected; unused attempts expire at 10 min and
  codes at 2 min; Google cancellation returns `error=cancelled` with no code;
  linking keeps the native session and adds `google`; linking a Google account
  owned by another user returns `already_linked`; a cookie-only session cannot
  start a native link; unverified existing email accounts are not silently linked
  (`not_linked`), verified ones are signed into the same user; the QA wrapper never
  lets a browser reach real Google; **legacy web** `POST /api/auth/sign-in/social`
  with `callbackURL: "/today"` still round-trips through
  `/api/auth/callback/google` to a cookie session.
- `apps/client/src/google.test.ts` (8): warm return beats a racing focus refresh;
  cold-start resume; no-op when nothing is pending; user cancel shows no error;
  expired/already-linked/unknown errors show only fixed copy and survive a later
  refresh; linking keeps the account cache; browser transport posts to the Better
  Auth endpoints with its own origin, reads only the provider URL, and strips the
  result from the address bar.
- `src-tauri/src/oauth.rs` (7): RFC 7636 S256 vector; strict callback parser
  (scheme/host/path, no duplicates, no extra params, token charset, safe error
  codes only); browser may only be sent to `/api/auth/native-oauth/authorize`
  (HTTPS, or loopback HTTP in debug); pending-state binding, replay (no pending),
  foreign state and expiry decisions; begin response and intent wire names.
- Root `bun run test` 41 files / 375 tests; `bun run build`; `cargo fmt --check`;
  `cargo test --locked` (14 passed, 1 ignored Keychain smoke).
- `bun run typecheck`: client and auth pass. `@todalo/api` currently fails only in
  other in-progress tickets' uncommitted files (`src/index.ts`,
  `src/task-operations.ts`), not in ticket 4 files.

## Browser walkthrough (fake Google, isolated memory API)

Vite on `localhost:5193` proxying to the QA API on `127.0.0.1:3029`:

1. Continue with Google → local consent → **Cancel**: back on the sign-in form,
   no error, `?google=…` stripped.
2. Continue with Google as `existing@example.test` (unverified local account):
   "This email already has a todalo account. Sign in with your password, then link
   Google from your account." No account created or merged.
3. Password sign-in → `/account` → **Link Google account** as
   `google-qa@example.test` (different email): returned to `/account`, no error;
   `document.cookie`, `localStorage`, `sessionStorage` all empty.
4. Sign out → Continue with Google as `google-qa@example.test`: signed into the
   linked existing account (Development User / existing@example.test).

## iPhone 17 Pro simulator (iOS 26, debug, `TAURI_TODALO_API_BASE_URL=http://127.0.0.1:3029`)

- `strings todalo.app/todalo` contains only `http://127.0.0.1:3029`.
- Built app Info.plist registers `CFBundleURLSchemes = [app.todalo.client]`.
- **Warm return:** Continue with Google opens Safari (system browser) on the
  local consent page → consent → Safari "Open in todalo?" → Open → app shows
  Today for the linked account.
- **Cold return:** start Google, `simctl terminate` the app, consent, Open →
  the app launches but **the launch URL is dropped**: tao 0.37.1's scene delegate
  (`scene:willConnectToSession:options:`) ignores `connectionOptions.URLContexts`,
  so neither `get_current` nor `on_open_url` sees it. The pending verifier survived
  in Keychain, so tapping "Return to todalo" on the still-open Safari page (the
  complete endpoint renders this page instead of a bare 302 for this reason)
  completed sign-in in the now-running app. Cold return therefore works with one
  extra tap; an upstream tao fix (or an Apple-session implementation, below) is
  needed for a one-tap cold return.
- **Replay:** tapping "Return to todalo" again after success → ignored; session
  intact, no error.
- **Cancellation:** fake consent Cancel → Open → sign-in form, no error.
- 6,641 lines of the app's unified log for the session contain no
  `set-auth-token`, `Bearer`, `code=`, `verifier`, `oauth/callback` or
  `native-oauth` strings.

## Not verified

- Real Google consent (needs the configuration below), physical iPhone, Mac app
  deep-link return (the scheme is registered for desktop but no Mac bundle was
  exercised), the in-app **Cancel** button on a device (covered by unit tests),
  and the legacy Next host serving `/api/auth/native-oauth/*` live (same plugin
  and handler; only exercised through Elysia).

## What the user must configure for real Google

1. Google Cloud console, existing **Web** OAuth client used by the legacy app:
   keep `${BETTER_AUTH_URL}/api/auth/callback/google` as an authorized redirect
   URI. Native sign-in reuses this same callback; no new client or iOS client is
   needed because Google only ever redirects to the server.
2. `BETTER_AUTH_URL` must be the HTTPS origin whose `/api/auth/*` is served by the
   shared auth handler. The native app opens the `authorizeURL` the server returns
   (`${BETTER_AUTH_URL}/api/auth/native-oauth/authorize`), so the Google callback,
   state cookie and completion page share one origin.
3. Native builds: `TAURI_TODALO_API_BASE_URL` (iOS) / `TODALO_API_BASE_URL` (Mac)
   = the HTTPS API origin. Debug HTTP is loopback-only.
4. Production return: replace the custom scheme with an owned-domain universal
   link — add `plugins.deep-link.mobile: [{ scheme: ["https"], host, pathPrefix,
   appLink: true }]`, the Associated Domains entitlement
   (`applinks:<host>`, requires the paid team `BS65XAQ9NH` provisioning), serve
   `/.well-known/apple-app-site-association` for `BS65XAQ9NH.app.todalo.client`,
   and pass that URL as `nativeOAuth({ appRedirect })`.

## Risks and follow-ups

- **Custom-scheme interception.** Any app can register `app.todalo.client`. PKCE
  stops a code stolen from a flow *this* app started, but not an attacker app that
  starts its own flow and lures the victim through it. Universal links (above) or
  `ASWebAuthenticationSession` (which captures its callback scheme) close this;
  ship one of them before release.
- **ASWebAuthenticationSession.** Not implemented (needs Objective-C bindings and a
  presentation anchor from Rust or a Swift plugin). It would also give an in-app
  sheet, ephemeral cookies and no cold-start path.
- Safari keeps its own Google session; the todalo browser session created by the
  callback is revoked, but a previously existing todalo cookie in Safari is
  overwritten by the callback's (that session row stays valid).
- Browser-client return assumes the client is served from the `BETTER_AUTH_URL`
  origin (same as the existing proxy note); otherwise the cookie lands on the
  other host.
