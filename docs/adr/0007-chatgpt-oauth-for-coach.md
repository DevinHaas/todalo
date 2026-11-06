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
