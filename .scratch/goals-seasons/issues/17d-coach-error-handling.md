# 17d: Coach error handling: retries, typed error codes, toasts with the next step

User request: "add good error handling when there is an error with the AI model connected. Provide toast messages that support the user with retrying (retry 5 times, then the toast should be shown) and, if we need to sign in again, let the user directly renew their OAuth session."

**Interpretation (followed):**
- **Transient failures** (network/timeout, 429 rate limit, 5xx/408/409/529 overloaded) are retried automatically, up to 5 attempts. Backoff is exponential with jitter (500 ms base, capped at 4 s, half fixed and half random). Retry-After / retry-after-ms is respected. No retry starts if its wait would pass 20 s since the first call, so the UI never waits more than about 20 s plus the one attempt in flight. After the last failure the client shows an error toast with **Retry**, which runs the same request again.
- **Non-transient failures** are not retried and toast immediately. This covers a bad key, no credit, a refusal, and an invalid request or reply. The toast gives a clear message and an **Open Coach settings** action. An API-key 401/403 offers **Update key** instead, which opens that provider's card in Settings › Coach.
- **An expired ChatGPT sign-in** (401 on a call, refresh refused, or the pick expired with nothing taking over) toasts "ChatGPT sign-in expired" with **Sign in again**. That action starts the same flow as the card's button:
  - Mac: the loopback flow.
  - Web on localhost: a tab plus polling.
  - Web elsewhere: the card opens and its Sign in starts (the paste field lives there).
  - Once signed in, the coach queries refetch and the failed request runs again.
- **A fallback provider took over**: unchanged, Settings' quiet note only.

**Where retries run: server only**, in `createCoachModel` (packages/server/src/coach.ts). Every caller and route gets them. The client never retries automatically. Its React Query reads of the Coach already used `retry: false`, and Retry in the toast is the user's choice.

**Error shape:** `error: { code, provider, retryable, message }`, where `code` is one of `rate_limited`, `overloaded`, `network`, `auth_expired`, `bad_key`, `no_credit`, `refused` or `invalid`. It sits next to the existing `message` in each Coach route's 200 body, so the Rust passthrough (which returns the JSON as-is) keeps it with no Rust change. Routes that return it:
- Test connection
- Explanations and recommendations (the first failure)
- Drafts: day, week and recommendation
- Chat
- Planning
- Patterns learn
- Goal suggestions (coach)
- Capacity
- Model list (`/coach/models`, fallback list plus `error`)

**Toasts:** one shared helper, `apps/client/src/coach-errors.ts`.
- `coachToast` is the pure mapping (table-tested).
- `reportCoachError` uses the app's toast manager and Toaster. It shows at most one toast per error kind at a time, with id `coach-error-<code>`.
- Background reads are explanations, recommendations, capacity, goal suggestions and Weekly-review learning. They toast only what the user must fix (auth_expired, bad_key, no_credit), without Retry. Transient and invalid failures stay silent there because the inline fallback already covers them: no text, rules-only suggestions, no estimate. The next read asks again.
- The model picker does not toast; it already shows its own fallback reason inline.
- Settings' Test connection keeps its inline result. The `coach.test` shortcut outside Settings uses the helper.

**Keyboard:** no new command. Toast actions are reached the existing way (F6 into the toasts, Tab to the action, Enter). Checked in QA: F6, Tab, Tab, Enter on "Update key" opened Settings › Coach with the OpenAI card expanded.

**Status:** resolved

- [x] Error codes on `CoachModelError` (code, provider, retryable, retryAfterMs); `httpFailure` classification (OpenAI `insufficient_quota` 429 → no_credit), refusals → refused
- [x] Server-side retry with backoff, jitter, Retry-After and a 20 s budget, stopped by request cancel
- [x] `error` returned consistently from every Coach route (plus the "key no longer decrypts" path → bad_key, an unusable ChatGPT in Test connection → auth_expired)
- [x] Client helper with Retry / Sign in again / Update key / Open Coach settings, deduped per kind, background reads quiet
- [x] Expired ChatGPT pick with no fallback announced once per app run on reading the Coach state
- [x] Tests: classification and retry/backoff/budget/cancel table-tested with fake timers and a fake provider (coach.test.ts); route tests assert the error shape (coach, chat, drafts, planning, patterns, goal suggestions, capacity); client mapping, dedupe and expiry notice (coach-errors.test.ts)
- [x] `bun run typecheck`, `bun run test` (115 files, 1491 tests), `cargo check` green
- [x] Browser QA (web :5190, API :3014, Google loop disabled), test user only, cleaned up after:
  - A fake OpenAI key returns a real 401: the bad_key toast's "Update key" opens the card (01, 02).
  - Ollama pointed at a closed port gets 5 attempts in about 7.3 s, then the network toast. Its Retry re-sent the same chat text, and the composer kept the text (03).
  - An expired ChatGPT row for the test user: the toast's "Sign in again" (start mocked, no call to OpenAI) shows "Finish signing in", then "Signed in to ChatGPT" (04–06).
  - Screenshots: `docs/qa/coach-errors/`.
