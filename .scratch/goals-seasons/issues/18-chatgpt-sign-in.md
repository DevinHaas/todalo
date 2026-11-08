# 18: ChatGPT sign-in for the Coach

**What to build:** A user signs in with their ChatGPT account and the Coach runs on that subscription (ADR 0007). API keys and Ollama remain as fallbacks.

**Blocked by:** 17

**Status:** built and tested; waiting for the user's first real sign-in on the Mac (steps below). The user chose T3 Code's approach (8 Nov 2026) over the Codex client ID.

- [x] ChatGPT sign-in from Settings › Coach › OpenAI › "Sign in with ChatGPT", following T3 Code: OIDC discovery, OpenAI's dynamic registration for agent apps (todalo gets its own `oaiapp_*` client), PKCE authorization code with a loopback redirect, token exchange, refresh. Mac: a one-time listener on 127.0.0.1. Web on localhost: OpenAI sends the browser to `/api/v1/coach/chatgpt/callback`. Web elsewhere: the user pastes the address OpenAI sent the browser to. iPhone: not now (see below).
- [x] Tokens stored securely: AES-256-GCM with COACH_SECRET_KEY on the server (`coach_chatgpt`), with their client ID. The registration (client ID, email, whether sharing was allowed) is cached per user and redirect in `coach_chatgpt_clients` (migration 0032, additive, applied) and survives sign-out, so todalo registers once. The PKCE verifier never leaves the server.
- [x] Sign-out and expiry handled. Sign-out asks OpenAI to revoke the refresh token (best effort). Refresh 5 minutes before expiry, never before OpenAI's `earliest_refresh_at`, single-flight per user. A refused refresh (T3's error list, or sharing switched off) marks the sign-in expired and the saved key or Ollama takes over.
- [x] Tests at the API seam: route factory with in-memory store fakes, the real sign-in code and a fake auth.openai.com (`packages/server/src/coach-chatgpt.fake.ts`). PKCE, state, redirect and client checks are table-tested.
- [x] Keyboard: Alt+Shift+C sign in, Alt+Shift+P open OpenAI's page again, Alt+Shift+Q sign out (also inside Settings). Finishing a pasted address is the form's Enter.

## T3 Code's implementation (pingdotgg/t3code, read 8 Nov 2026)

`apps/server/src/provider/CodexChatGptAuth.ts`, `CodexManagedRuntime.ts`, `CodexChatGptModels.ts`, `packages/shared/src/codexAuthHandoff.ts`, `docs/user/providers-codex.md`:

- **Discovery:** `https://auth.openai.com/.well-known/openid-configuration`. The issuer must be `https://auth.openai.com` and every endpoint on it. Live today: authorize `/api/accounts/authorize`, token `/api/accounts/oauth/token`, revoke `/api/accounts/oauth/revoke`. There is **no** `registration_endpoint`: registration is not RFC 7591.
- **Registration:** happens inside the authorize request. The first sign-in sends `client_id=dynamic_agent_client` with `agent_name_hint` (T3 Code; here "todalo") and `ext_agent_host_id=urn:uuid:<install id>`. OpenAI returns the new `oaiapp_*` ID as `client_id` on the redirect. T3 saves it with the redirect URI and reuses it with `login_hint` (and `id_token_hint`); `prompt=consent` when sharing was refused before. Only the port may vary between attempts.
- **Authorize params (copied exactly):** `response_type=code`, `redirect_uri=http://127.0.0.1:<port>/auth/callback`, `scope=openid profile email offline_access resource.invoke chatgpt.tokens.use.direct`, `resource=https://api.openai.com/v1`, `state`, `nonce`, `code_challenge_method=S256`, `code_challenge`.
- **Exchange and refresh:** form-encoded to the token endpoint with `client_id`, `resource`, and `code`/`code_verifier`/`redirect_uri` or `refresh_token`. T3 requires `chatgpt.tokens.use.direct` in the returned scope ("allow sharing of your ChatGPT plan" on the consent page), checks the ID token's issuer, audience and nonce (plus its JWKS signature), honours `earliest_refresh_at`, and treats `invalid_grant`, `invalid_refresh_token`, `token_expired`, `refresh_token_expired`, `refresh_token_invalidated` and `refresh_token_reused` as signed out.
- **Model calls:** T3 only hands the token to the Codex binary, through a custom provider: `base_url="https://api.openai.com/v1"`, `wire_api="responses"`, `requires_openai_auth=false`, token from an auth command. It lists models with `GET https://api.openai.com/v1/models` and the token as Bearer. So the token is for the **public** API at api.openai.com (its `resource`), not `chatgpt.com/backend-api/codex`. todalo now calls `POST https://api.openai.com/v1/responses` with `Authorization: Bearer`, `stream: true`, `store: false`, todalo's own instructions and `text.format` json_schema. It sends no `originator` and no `ChatGPT-Account-ID`.
- **Server-side calls:** should work. Codex makes the same HTTPS calls with the same bearer token, and nothing ties the token to a machine. Not verified, because no real token exists yet. Open questions for the first sign-in: whether plan sharing covers `text.format` json_schema and `gpt-5.5` (T3's docs say some features are not covered: then Test connection shows "your plan's sharing may not cover it"), and whether `chatgpt.com/backend-api/codex/responses` accepts the token (not expected: it is issued for api.openai.com/v1; todalo does not use that endpoint).
- **Redirects, checked live (no user data):** OpenAI's authorize page accepts loopback redirects (`127.0.0.1` or `localhost`, any port or path: it shows the log-in page). It rejects any other host with `invalid_authorize_request` on `redirect_uri`. So a deployed web app cannot receive the redirect, and T3 has the same limit for remote machines ("paste the full URL from the final localhost page"). todalo's web uses the API callback on localhost and the paste fallback elsewhere.

## How todalo's sign-in works now

1. **Start:** `POST /api/v1/coach/chatgpt/start`. The Mac app binds 127.0.0.1 on a random port and sends `{ port }`. The web sends nothing, so the server picks the redirect from the request's Origin: localhost gives the API callback; any other host gives paste mode (a random 127.0.0.1 port where nothing listens). The server makes state, nonce and the PKCE verifier and keeps them for 10 minutes (in memory, one sign-in per user). It looks up the cached registration and returns OpenAI's authorize URL. The verifier is never sent to a client.
2. **Browser:** the Mac app opens the system browser (its opener allows only `https://auth.openai.com/api/accounts/authorize?…`). The web opens a tab. The user signs in at OpenAI and allows sharing of their ChatGPT plan with todalo.
3. **Return:** Mac: the listener takes the first `GET /auth/callback…` and posts the full address to `POST /coach/chatgpt/complete`. When that returns, the browser shows "ChatGPT is connected" (or "failed, return to todalo"). Web on localhost: `GET /coach/chatgpt/callback` with the session cookie. Web elsewhere: the user pastes the address into Settings, which calls complete.
4. **Complete:** the state must belong to a pending sign-in of the same signed-in user. It works once, and only within 10 minutes. The address must match the redirect (origin and path) and the client must be an `oaiapp_*` that matches the cached one. The registration is cached before the exchange. The code is exchanged with the verifier. The ID token must have issuer auth.openai.com, our client as audience and our nonce (no JWKS check: it comes straight from the token endpoint over TLS). Without the sharing scope, nothing is stored and the next sign-in sends `prompt=consent`. `invalid_client` forgets the registration, so the next sign-in registers again.
5. **Use:** while signed in the Coach calls the Responses API with the access token. A 401 means signed out; a 403 says the plan's sharing may not cover the request.

**iPhone (not now):** a loopback listener cannot reliably receive Safari's redirect while the app is in the background. A custom URL scheme redirect was not tried; only loopback is known to work. The iPhone app says "Sign in with ChatGPT on the Mac or on the web; the Coach then uses it here too". The tokens live on the server, so a sign-in elsewhere covers the iPhone.

**Deliberately left out:** `id_token_hint` on re-sign-in (only `login_hint` is sent, so no ID token is stored), the JWKS signature check (see step 4), multiple ChatGPT accounts per user, and a cancel command for the Mac listener (a newer sign-in or the 10-minute timeout ends it).

## Sign in on the Mac (the user's steps)

Needs COACH_SECRET_KEY on the API (already set in `.env`). No other setting is needed: `CHATGPT_OAUTH_CLIENT_ID` is gone.

1. Run the API and the Mac app from this worktree as usual, and sign in to todalo.
2. Open Settings › Coach (Alt+Shift+C), press **Configure** on the ChatGPT card, then **Sign in with ChatGPT** (or press Alt+Shift+C again: it opens the card and starts the sign-in). Your default browser opens OpenAI's page. (Ticket 17c replaced the provider dropdown with a card per provider.)
3. Sign in to ChatGPT. On the consent page OpenAI should name **todalo**. Allow sharing of your ChatGPT plan.
4. The browser shows "ChatGPT is connected", and within a second Settings shows "Signed in with ChatGPT as <your email>". If you closed the tab too early, press "Open OpenAI sign-in again" (Alt+Shift+P). The sign-in waits up to 10 minutes.
5. Press **Test connection** (Alt+Shift+T). Note the message if it fails: "sharing may not cover it" (403) or "refused the request" (400, for example the model or json_schema). Try the model `gpt-5.4-mini` under Model if `gpt-5.5` is refused.
6. Open a season page: the goal explanations now come from ChatGPT.
7. Fallback check: save an API key on another card (OpenAI, Anthropic or OpenRouter), choose ChatGPT in the "Coach model" picker at the top, then sign out of ChatGPT (Alt+Shift+Q) and press Test connection beside the picker. It should name the key provider. Sign in again: OpenAI should not register a second client, your email is filled in, and the new sign-in becomes the active provider again.

QA screenshots: `docs/qa/coach-chatgpt/` (web at localhost:5189 as test@todalo.dev). In 01–03 the start is real: discovery hit auth.openai.com, which accepted the localhost callback and showed its log-in page. Nobody signed in. 04: a forged state on the callback route is refused. 05 mocks only the start reply to show paste mode; in 06 the real server refuses the pasted address because its state is unknown.

Spec: ../spec.md. Vocabulary: CONTEXT.md.
