# 18: ChatGPT sign-in for the Coach

**What to build:** A user signs in with their ChatGPT account and the Coach runs on that subscription (ADR 0007). API keys and Ollama remain as fallbacks.

**Blocked by:** 17

**Status:** needs-decision (built and tested; off until the user decides on the OAuth client ID, see below)

- [x] ChatGPT OAuth sign-in from AI provider settings on web, Mac and iPhone (device code flow, so no redirect back to todalo is needed; Settings › Coach › OpenAI offers "Sign in with ChatGPT" and "Use an API key")
- [x] Tokens stored securely: AES-256-GCM with COACH_SECRET_KEY on the server, like API keys. Not in the Keychain. The model calls run on the server for web and native alike, so the server must hold the token. The native Keychain still holds only the todalo session.
- [x] Sign-out and expiry handled; the Coach falls back to another configured provider. The token is refreshed 5 minutes before it expires. If OpenAI refuses the refresh, the sign-in is marked expired, Settings says "sign in again", and the saved key or Ollama provider takes over.
- [x] Behaviour covered by tests at the API seam (route factory with in-memory fakes), following the existing route tests
- [x] Any new user action has a keyboard command in the shortcut registry: Alt+Shift+C sign in, Alt+Shift+P open OpenAI's page, Alt+Shift+Q sign out. They also work inside the Settings dialog, and so does Alt+Shift+T.

## Research (8 Nov 2026, openai/codex source at commit 4e4767ff)

- **Browser flow (Codex CLI):** PKCE against `https://auth.openai.com/oauth/authorize`, using Codex's client `app_EMoamEEZ73f0CkXaXp7hrann`. The redirect is `http://127.0.0.1:1455/auth/callback` (`codex-rs/login/src/server.rs`). The code is exchanged at `/oauth/token` (form-encoded). A web server cannot receive a localhost redirect, so this flow does not fit todalo.
- **Device code flow (used here):** POST `/api/accounts/deviceauth/usercode` with `{client_id}` returns `device_auth_id`, `user_code` and `interval`. The user enters the code at `https://auth.openai.com/codex/device`. Then poll POST `/api/accounts/deviceauth/token` with `{device_auth_id, user_code}`: 403 or 404 means pending. Success returns `authorization_code` and `code_verifier`, which are exchanged at `/oauth/token` with `redirect_uri=https://auth.openai.com/deviceauth/callback`. Codes last 15 minutes (`codex-rs/login/src/device_code_auth.rs`).
- **Refresh:** POST `/oauth/token` with JSON `{grant_type: "refresh_token", client_id, refresh_token}`. Codex refreshes 5 minutes before expiry, every 8 days, and after a 401. The account ID comes from the JWT claim `https://api.openai.com/auth`'s `chatgpt_account_id`.
- **Model calls:** POST `https://chatgpt.com/backend-api/codex/responses` with headers `Authorization: Bearer`, `ChatGPT-Account-ID` and `originator`. The body has `store: false` and `stream: true`; the reply streams as SSE (`response.output_text.delta`, `response.completed`). Not verified: whether the backend accepts `text.format` json_schema, `instructions` that are not Codex's own, or an originator other than Codex's. The model list includes `gpt-5.5` (the default here).
- **Terms:** I found no sanctioned way for a third-party app to sign users in with ChatGPT and use their subscription. There is no OAuth client program, and the Codex docs cover only Codex itself. OpenAI's Terms and Services Agreement pages could not be fetched (403), so check them yourself. The only client ID that works is Codex's own, and it is registered for Codex. Using it from todalo means presenting todalo to OpenAI as the Codex CLI.

## What was built, and the decision for the user

The sign-in, token storage, refresh, fallback, Responses API adapter, UI and tests are all built. The shipped code does not pose as Codex:

- There is no built-in client ID. The server offers ChatGPT sign-in only when `CHATGPT_OAUTH_CLIENT_ID` is set. Without it, Settings says "This server does not offer ChatGPT sign-in yet".
- Requests send `originator: todalo` and todalo's own instructions, not Codex's.

**Decision needed:**
- (a) Set `CHATGPT_OAUTH_CLIENT_ID` to Codex's public client ID for personal use, accepting that this presents todalo as Codex and may break OpenAI's terms. ADR 0007 accepted "not explicitly permitted", not impersonation. The backend may also reject the non-Codex originator or instructions. If it does, making it work would mean copying Codex's headers and prompt, which I did not do.
- (b) Keep it off and use API keys until OpenAI offers a client ID for third-party apps.
- (c) Switch to driving the user's own logged-in Codex on Mac (ADR 0007's stated fallback). That works on Mac only.

## Manual sign-in check (needs your browser login; not run by the agent)

1. Choose (a) above, then add `CHATGPT_OAUTH_CLIENT_ID=<client id>` to `.env` (COACH_SECRET_KEY must be set) and restart the API.
2. Open Settings › Coach, choose OpenAI, then "Sign in with ChatGPT" (or press Alt+Shift+C). A code appears.
3. Press "Open OpenAI sign-in" (Alt+Shift+P), sign in to ChatGPT, and enter the code. Within about 5 seconds Settings shows "Signed in with ChatGPT as …".
4. Press Test connection (Alt+Shift+T). If it fails with "refused the request", the backend rejects todalo's originator, instructions or json_schema (see the decision above). Report the message.
5. Open a season page: the goal explanations now come from ChatGPT.
6. Fallback check: save an API key under "Use an API key", sign out of ChatGPT (Alt+Shift+Q), and Test connection again. It should name the key provider.

QA screenshots: `docs/qa/coach-providers/` (05–07 mock the sign-in endpoints in the browser; no call reached OpenAI).

Spec: ../spec.md. Vocabulary: CONTEXT.md.
