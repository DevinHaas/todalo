# 0007: ChatGPT sign-in for the Coach via direct OAuth

Status: Accepted, 6 November 2026.

The Coach should run on the AI subscription a user already pays for, not only on
API keys. Anthropic's terms forbid third-party apps from offering Claude.ai login
or routing requests through subscription credentials, and Google forbids
third-party use of Gemini CLI OAuth, so neither is offered. For ChatGPT, Habito
runs the OAuth sign-in itself (the same flow Codex uses) instead of driving a
locally installed, logged-in Codex. That works on web as well as Mac and needs no
Codex install. The user accepted that OpenAI does not explicitly permit this for
third-party apps, and that the flow can break without notice whenever OpenAI
changes it.

## Consequences

- API keys (any supported provider) and local Ollama remain first-class
  fallbacks, so the Coach keeps working if ChatGPT sign-in breaks or is revoked.
- Re-check OpenAI's terms before any public distribution; if they prohibit this,
  switch to driving the user's own Codex on Mac.

## Note, 8 November 2026 (tickets 17b and 18)

- Anthropic is supported by API key only (Messages API with structured outputs).
- ChatGPT sign-in is built on OpenAI's device code flow, so web, Mac and iPhone need no redirect back to todalo. The tokens are encrypted on the server with COACH_SECRET_KEY, because the server makes the model calls. The Coach falls back to the saved key when the sign-in is refused or signed out.
- OpenAI has no OAuth client program for third-party apps. The only client ID that works is the Codex CLI's, so using it presents todalo as Codex. That goes further than this ADR's "not explicitly permitted". The code therefore ships with no client ID and an honest `originator: todalo`. The sign-in is offered only when `CHATGPT_OAUTH_CLIENT_ID` is set. Whether to set it is the user's decision, recorded in ticket 18.
