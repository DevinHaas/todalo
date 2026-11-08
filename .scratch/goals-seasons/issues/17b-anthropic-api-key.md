# 17b: Anthropic models via API key

User request after 17: besides OpenAI (API key and ChatGPT subscription, ticket 18), OpenRouter and Ollama, the Coach supports Anthropic models with the user's own Anthropic API key.

**What to build:**

- "Anthropic" in the Settings › Coach provider choice: API key (encrypted like the others, "…last4"), model field defaulting to a current Claude model (e.g. `claude-sonnet-5-5`), Test connection, Disconnect.
- Server: Anthropic is not OpenAI-compatible for structured output, so add an adapter behind the existing coach client seam (native Messages API, `x-api-key`, `anthropic-version`; structured JSON via the documented structured-output or a forced tool call). Callers of the coach client do not change.
- Error mapping like 17 (bad key, out of credit, rate limit).
- Claude.ai subscription sign-in stays out of scope (spec).

**Status:** resolved

- [x] Anthropic provider in settings with key, model, test, disconnect
- [x] Adapter behind the existing client seam; explanations and later Coach features work unchanged
- [x] Tests at the API seam with a fake; adapter request/response mapping table-tested; no real model calls in tests
- [x] Spec/ADR note updated (Anthropic API key supported)

## Notes (research, 8 Nov 2026)

- Raw `fetch` to `POST https://api.anthropic.com/v1/messages` with `x-api-key` and `anthropic-version: 2026-10-21`, the same plain-fetch approach as the other providers (`packages/server/src/coach.ts`, `anthropicRequest` / `parseAnthropic`). System messages go to `system`. No `temperature`: the 2026-10-21 API version rejects sampling parameters.
- Structured JSON uses `output_config.format: { type: "json_schema", schema }`. Current models (Sonnet 5.5, Opus 5.5) return a 400 on a forced `tool_choice`, so the tool-call route is not used. `output_config.effort: "low"` suits short Coach answers, but it needs a Claude 5 generation model; older ids fail Test connection.
- Replies: text blocks joined, thinking blocks skipped. `stop_reason` of `refusal` gives "The model declined to answer"; `max_tokens` counts as incomplete. Errors: 401/403 bad key, 402 out of credit, 429 rate limit, 529 or 5xx unavailable.
- Current ids: `claude-opus-5-5`, `claude-sonnet-5-5` (default), `claude-haiku-5-5`.
- Live check skipped: there is no `ANTHROPIC_API_KEY` in `.env`. Browser QA connected and disconnected a fake key for the test user, without Test connection (`docs/qa/coach-providers/03–04`).
