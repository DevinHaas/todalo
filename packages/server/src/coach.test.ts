import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  anthropicRequest, chatgptRequest, chatRequest, coachErrorDto, CoachModelError, coachRetry, createCoachModel, httpFailure, retryAfter, retryDelay, parseAnthropic, parseChatgptStream, explanationFacts, explanationMessages, explanationSchema, failureMessage, nextCoachProvider, ollamaUrl, parseCompletion, parseExplanation, parsePing, pickCoachProvider,
  type CoachConfig, type CoachModelKind,
} from "./coach";
import { openSecret, sealSecret, CoachSecretError } from "./coach-secret";
import type { GoalStatusDto, WeekSignals } from "./goal-status";

const config = (provider: CoachConfig["provider"], extra: Partial<CoachConfig> = {}): CoachConfig =>
  ({ provider, model: "m", baseUrl: null, apiKey: provider === "ollama" ? null : "sk-test-1234", ...extra });

describe("chatRequest", () => {
  it.each([
    ["openai", config("openai"), "https://api.openai.com/v1/chat/completions", true, "max_completion_tokens"],
    ["openrouter", config("openrouter"), "https://openrouter.ai/api/v1/chat/completions", true, "max_completion_tokens"],
    ["ollama default", config("ollama"), "http://127.0.0.1:11434/v1/chat/completions", false, "max_tokens"],
    ["ollama custom port", config("ollama", { baseUrl: "http://localhost:11500/" }), "http://localhost:11500/v1/chat/completions", false, "max_tokens"],
    // A non-loopback URL that slipped into storage still never leaves the machine.
    ["ollama foreign host", config("ollama", { baseUrl: "http://169.254.169.254" }), "http://127.0.0.1:11434/v1/chat/completions", false, "max_tokens"],
  ])("%s", (_name, cfg, url, bearer, budget) => {
    const request = chatRequest(cfg, { messages: [{ role: "user", content: "hi" }], schema: explanationSchema });
    expect(request.url).toBe(url);
    expect("authorization" in request.init.headers).toBe(bearer);
    const body = JSON.parse(request.init.body);
    expect(body).toMatchObject({ model: "m", stream: false, messages: [{ role: "user", content: "hi" }] });
    expect(body[budget]).toBeGreaterThan(0);
    expect(body.response_format).toEqual({ type: "json_schema", json_schema: { name: "goal_status_explanation", strict: true, schema: explanationSchema.schema } });
    expect(body.provider !== undefined).toBe(cfg.provider === "openrouter");
  });

  it("omits response_format without a schema", () => {
    expect(JSON.parse(chatRequest(config("openai"), { messages: [] }).init.body).response_format).toBeUndefined();
  });
});

describe("images (ticket 29)", () => {
  const messages = [{ role: "system" as const, content: "s" }, { role: "user" as const, content: "what is this?", images: [{ mediaType: "image/png", data: "aGk=" }] }];
  const body = (request: { init: { body: string } }) => JSON.parse(request.init.body);
  it("puts them in each provider's own content parts, text-only messages unchanged", () => {
    expect(body(chatRequest(config("openai"), { messages })).messages).toEqual([
      { role: "system", content: "s" },
      { role: "user", content: [{ type: "text", text: "what is this?" }, { type: "image_url", image_url: { url: "data:image/png;base64,aGk=" } }] },
    ]);
    expect(body(anthropicRequest(config("anthropic"), { messages })).messages).toEqual([
      { role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: "aGk=" } }, { type: "text", text: "what is this?" }] },
    ]);
    expect(body(chatgptRequest(config("chatgpt"), { messages })).input[0].content).toEqual([
      { type: "input_text", text: "what is this?" }, { type: "input_image", image_url: "data:image/png;base64,aGk=" },
    ]);
  });
});

describe("anthropicRequest (ticket 17b)", () => {
  const messages = [{ role: "system" as const, content: "Be brief." }, { role: "user" as const, content: "hi" }];
  it.each([
    ["with a schema", explanationSchema, { effort: "low", format: { type: "json_schema", schema: explanationSchema.schema } }],
    ["without a schema", undefined, { effort: "low" }],
  ])("%s", (_name, schema, outputConfig) => {
    const request = anthropicRequest(config("anthropic", { model: "claude-sonnet-5-5" }), { messages, schema });
    expect(request.url).toBe("https://api.anthropic.com/v1/messages");
    expect(request.init.headers).toEqual({ "content-type": "application/json", "anthropic-version": "2026-10-21", "x-api-key": "sk-test-1234" });
    const body = JSON.parse(request.init.body);
    // System text moves to `system`; no sampling parameters (the 2026-10-21 API version rejects them).
    expect(body).toEqual({ model: "claude-sonnet-5-5", max_tokens: 8_000, system: "Be brief.", messages: [{ role: "user", content: "hi" }], output_config: outputConfig });
  });
});

describe("parseAnthropic", () => {
  const message = (stop: string, content: unknown) => ({ stop_reason: stop, content });
  it.each([
    ["text after thinking", message("end_turn", [{ type: "thinking", thinking: "" }, { type: "text", text: '{"ok":true}' }]), '{"ok":true}'],
    ["two text blocks", message("end_turn", [{ type: "text", text: '{"ok":' }, { type: "text", text: "true}" }]), '{"ok":true}'],
    ["cut off", message("max_tokens", [{ type: "text", text: '{"ok"' }]), null],
    ["refused", message("refusal", []), null],
    ["no text", message("end_turn", [{ type: "thinking", thinking: "" }]), null],
    ["an error body", { type: "error", error: { type: "overloaded_error" } }, null],
  ])("%s", (_name, body, expected) => {
    if (expected === null) expect(() => parseAnthropic(body)).toThrow(CoachModelError);
    else expect(parseAnthropic(body)).toBe(expected);
  });
});

describe("chatgptRequest (ticket 18)", () => {
  it("calls the Responses API with the account header, todalo's own instructions and a strict schema", () => {
    const request = chatgptRequest(config("chatgpt", { model: "gpt-5.5", apiKey: "access" }),
      { messages: [{ role: "system", content: "Be brief." }, { role: "user", content: "hi" }], schema: explanationSchema });
    expect(request.url).toBe("https://api.openai.com/v1/responses");
    expect(request.init.headers).toEqual({ "content-type": "application/json", accept: "text/event-stream", authorization: "Bearer access" });
    expect(JSON.parse(request.init.body)).toEqual({
      model: "gpt-5.5", instructions: "Be brief.", store: false, stream: true, reasoning: { effort: "low" },
      input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "hi" }] }],
      text: { format: { type: "json_schema", name: "goal_status_explanation", strict: true, schema: explanationSchema.schema } },
    });
  });
});

describe("parseChatgptStream", () => {
  const sse = (...events: unknown[]) => events.map(event => `event: x\ndata: ${JSON.stringify(event)}\n\n`).join("");
  const done = (text: string, status = "completed") => ({ type: "response.completed", response: { status, output: [{ type: "reasoning" }, { type: "message", content: [{ type: "output_text", text }] }] } });
  it.each([
    ["the completed response", sse({ type: "response.output_text.delta", delta: "{" }, done('{"ok":true}')), '{"ok":true}'],
    ["deltas when the completed output is empty", sse({ type: "response.output_text.delta", delta: '{"ok":' }, { type: "response.output_text.delta", delta: "true}" }, { type: "response.completed", response: { status: "completed", output: [] } }), '{"ok":true}'],
    ["a broken line is skipped", `data: {nope\n${sse(done("x"))}`, "x"],
    ["failed", sse({ type: "response.failed", response: {} }), null],
    ["incomplete", sse({ type: "response.incomplete", response: {} }), null],
    ["never completed", sse({ type: "response.output_text.delta", delta: "x" }), null],
    ["not a stream", "<html>blocked</html>", null],
  ])("%s", (_name, stream, expected) => {
    if (expected === null) expect(() => parseChatgptStream(stream)).toThrow(CoachModelError);
    else expect(parseChatgptStream(stream)).toBe(expected);
  });
});

describe("createCoachModel", () => {
  const fake = (response: Response) => { const seen: string[] = []; return { seen, fetcher: (async (url: string) => { seen.push(url); return response; }) as unknown as typeof fetch }; };
  it.each([
    ["anthropic", config("anthropic"), new Response(JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text: "a" }] })), "https://api.anthropic.com/v1/messages", "a"],
    ["chatgpt", config("chatgpt"), new Response(`data: ${JSON.stringify({ type: "response.completed", response: { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "c" }] }] } })}\n`), "https://api.openai.com/v1/responses", "c"],
    ["openai", config("openai"), new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "o" } }] })), "https://api.openai.com/v1/chat/completions", "o"],
  ])("routes %s to its adapter", async (_name, cfg, response, url, text) => {
    const { seen, fetcher } = fake(response);
    expect(await createCoachModel(cfg, fetcher).complete({ messages: [{ role: "user", content: "hi" }] })).toBe(text);
    expect(seen).toEqual([url]);
  });
  it.each([
    [config("chatgpt"), 401, "ChatGPT signed you out. Sign in again in Settings › Coach."],
    [config("chatgpt"), 429, "You reached your ChatGPT plan's usage limit. Try again later."],
    [config("anthropic"), 401, "The provider rejected the API key."],
    [config("anthropic"), 402, "The provider says this key is out of credit."],
    [config("anthropic"), 529, "The provider is busy or unavailable. Try again later."],
  ])("maps %o %i", async (cfg, status, message) => {
    const { fetcher } = fake(new Response("{}", { status }));
    await expect(createCoachModel(cfg, fetcher, { sleep: async () => {} }).complete({ messages: [] })).rejects.toThrow(message);
  });
});

describe("ollamaUrl", () => {
  it.each([
    [undefined, "http://127.0.0.1:11434"], ["", "http://127.0.0.1:11434"], ["http://localhost:11434/", "http://localhost:11434"],
    ["http://[::1]:11434", "http://[::1]:11434"], ["https://127.0.0.1:8443/ollama/", "https://127.0.0.1:8443/ollama"],
    ["http://192.168.1.5:11434", null], ["http://example.com", null], ["http://user:pw@localhost:11434", null],
    ["file:///etc/passwd", null], ["http://localhost:11434/?x=1", null], ["not a url", null],
  ])("%s → %s", (raw, expected) => expect(ollamaUrl(raw)).toBe(expected));
});

describe("parseCompletion", () => {
  const reply = (finish: string, content: unknown, refusal?: string) => ({ choices: [{ finish_reason: finish, message: { content, refusal } }] });
  it.each([
    ["a finished answer", reply("stop", "{\"ok\":true}"), "{\"ok\":true}"],
    ["cut off", reply("length", "{\"ok\""), null],
    ["refused", reply("stop", "", "no"), null],
    ["empty", reply("stop", "  "), null],
    ["no choices", { choices: [] }, null],
    ["not JSON at all", null, null],
  ])("%s", (_name, body, expected) => {
    if (expected === null) expect(() => parseCompletion(body)).toThrow(CoachModelError);
    else expect(parseCompletion(body)).toBe(expected);
  });
});

describe("parseExplanation and parsePing", () => {
  it.each([
    ['{"explanation":"  You finished\\n three tasks. "}', "You finished three tasks."],
    [JSON.stringify({ explanation: "x".repeat(700) }), `${"x".repeat(599)}…`],
    ['{"explanation":""}', null], ['{"text":"hi"}', null], ["You are on track.", null],
  ])("%s", (content, expected) => {
    if (expected === null) expect(() => parseExplanation(content)).toThrow(CoachModelError);
    else expect(parseExplanation(content)).toBe(expected);
  });
  it("accepts only {ok: true}", () => {
    expect(() => parsePing('{"ok":true}')).not.toThrow();
    for (const content of ['{"ok":false}', "ok", "{}"]) expect(() => parsePing(content)).toThrow(CoachModelError);
  });
});

describe("explanationFacts", () => {
  const week = (completed: number, elapsed = 1): WeekSignals => ({ ratings: ["solid"], completed, scheduledMinutes: 120, keptMinutes: 60, milestones: 0, elapsed });
  const status = (band: GoalStatusDto["band"]): GoalStatusDto => ({ band, score: 0.42, weeks: [0.8, 0.31], projection: 0.355 });
  const goal = { title: "Become fit", tier: "primary" as const, target: "Run 10k" };

  it("is null while Too early: nothing to explain", () => {
    expect(explanationFacts({ goal, status: status("too_early"), weeks: [week(1)], day: 3, length: 84 })).toBeNull();
  });

  it("sends only computed numbers, as percentages, with the week in progress marked", () => {
    const facts = explanationFacts({ goal, status: status("adjust"), weeks: [week(3), week(1, 0.5)], day: 11, length: 84 })!;
    expect(facts).toEqual({
      goal: "Become fit", tier: "primary", target: "Run 10k", seasonDay: 11, seasonLength: 84, status: "Adjust", score: 42, projectedAtSeasonEnd: 36,
      weeks: [
        { week: 1, inProgress: false, weekElapsed: 100, score: 80, goalTasksCompleted: 3, minutesScheduled: 120, minutesKept: 60, progressRatings: ["Solid"], milestonesReached: 0 },
        { week: 2, inProgress: true, weekElapsed: 50, score: 31, goalTasksCompleted: 1, minutesScheduled: 120, minutesKept: 60, progressRatings: ["Solid"], milestonesReached: 0 },
      ],
    });
    const [system, user] = explanationMessages(facts);
    expect(system!.role).toBe("system");
    expect(system!.content).toContain("On track is 60 or more, Adjust 35 or more");
    expect(JSON.parse(user!.content)).toEqual(facts);
  });
});

describe("createCoachModel", () => {
  const instant = { sleep: async () => {} };
  it("maps HTTP failures and unreachable hosts to messages the user can act on", async () => {
    const failing = (status: number) => createCoachModel(config("openai"), async () => new Response("{}", { status }), instant);
    await expect(failing(401).complete({ messages: [] })).rejects.toThrow("rejected the API key");
    await expect(failing(429).complete({ messages: [] })).rejects.toThrow(failureMessage(429));
    const offline = createCoachModel(config("ollama"), async () => { throw new TypeError("fetch failed"); }, instant);
    await expect(offline.complete({ messages: [] })).rejects.toThrow("Could not reach Ollama");
  });
});

// Ticket 17d: the error code each failure gets, and whether it is retried.
describe("httpFailure", () => {
  it.each([
    [401, "chatgpt", "", "auth_expired", false],
    [403, "chatgpt", "", "refused", false],
    [429, "chatgpt", "", "rate_limited", true],
    [401, "openai", "", "bad_key", false],
    [403, "anthropic", "", "bad_key", false],
    [402, "openrouter", "", "no_credit", false],
    [429, "openai", '{"error":{"code":"insufficient_quota"}}', "no_credit", false],
    [429, "anthropic", '{"error":{"message":"Your credit balance is too low"}}', "no_credit", false],
    [429, "openai", '{"error":{"code":"rate_limit_exceeded"}}', "rate_limited", true],
    [404, "openai", "", "invalid", false],
    [400, "anthropic", "", "invalid", false],
    [422, "ollama", "", "invalid", false],
    [418, "openai", "", "invalid", false],
    [408, "openai", "", "overloaded", true],
    [500, "openai", "", "overloaded", true],
    [503, "openrouter", "", "overloaded", true],
    [529, "anthropic", "", "overloaded", true],
  ] as const)("%i from %s → %s", (status, provider, body, code, retryable) => {
    const error = httpFailure(status, provider, body);
    expect([error.code, error.retryable, error.provider]).toEqual([code, retryable, provider]);
    expect(coachErrorDto(error)).toEqual({ code, provider, retryable, message: error.message });
  });
  it("reads a refusal as refused, a cut-off or malformed reply as invalid", () => {
    const code = (run: () => unknown) => { try { run(); } catch (error) { return (error as CoachModelError).code; } };
    expect(code(() => parseCompletion({ choices: [{ finish_reason: "stop", message: { refusal: "no" } }] }))).toBe("refused");
    expect(code(() => parseAnthropic({ stop_reason: "refusal", content: [] }))).toBe("refused");
    expect(code(() => parseCompletion({ choices: [{ finish_reason: "length", message: { content: "{" } }] }))).toBe("invalid");
    expect(code(() => parseExplanation("not json"))).toBe("invalid");
  });
  it("reads Retry-After in seconds, as a date, and OpenAI's retry-after-ms", () => {
    expect(retryAfter(new Headers({ "retry-after": "3" }))).toBe(3_000);
    expect(retryAfter(new Headers({ "retry-after-ms": "250" }))).toBe(250);
    expect(retryAfter(new Headers({ "retry-after": new Date(10_000).toUTCString() }), 4_000)).toBe(6_000);
    expect(retryAfter(new Headers())).toBeUndefined();
    expect(retryAfter(new Headers({ "retry-after": "soon" }))).toBeUndefined();
  });
});

describe("createCoachModel retries", () => {
  const ok = () => new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "{\"ok\":true}" } }] }), { status: 200 });
  /** A fake provider answering from a script; each entry a status, "network", or "ok". */
  function provider(script: (number | "network" | "ok")[], headers: Record<string, string> = {}) {
    const calls: number[] = [];
    const fetcher = (async () => {
      calls.push(Date.now());
      const next = script[Math.min(calls.length - 1, script.length - 1)];
      if (next === "network") throw new TypeError("fetch failed");
      return next === "ok" ? ok() : new Response("{}", { status: next, headers });
    }) as unknown as typeof fetch;
    return { fetcher, calls };
  }
  // Fake timers: the backoff waits run instantly but Date.now advances, so the budget is real.
  const run = async (model: ReturnType<typeof createCoachModel>, signal?: AbortSignal) => {
    const result = model.complete({ messages: [] }, signal).then(value => ({ value }), (error: CoachModelError) => ({ error }));
    await vi.runAllTimersAsync();
    return result;
  };
  beforeEach(() => { vi.useFakeTimers({ now: 0 }); });
  afterEach(() => { vi.useRealTimers(); });

  it.each([
    ["503 then success", [503, "ok"], 2, "ok"],
    ["network, 429, 529, then success", ["network", 429, 529, "ok"], 4, "ok"],
    ["five 503s: gives up after the fifth", [503], 5, "overloaded"],
    ["five network failures", ["network"], 5, "network"],
    ["401: not retried", [401], 1, "bad_key"],
    ["402 out of credit: not retried", [402], 1, "no_credit"],
    ["404: not retried", [404], 1, "invalid"],
  ] as const)("%s", async (_, script, attempts, outcome) => {
    const fake = provider([...script]);
    const result = await run(createCoachModel(config("openai"), fake.fetcher, { random: () => 0.5 }));
    expect(fake.calls).toHaveLength(attempts);
    if (outcome === "ok") expect(result).toEqual({ value: "{\"ok\":true}" });
    else expect("error" in result && result.error.code).toBe(outcome);
  });

  it("backs off exponentially with jitter between attempts", async () => {
    const fake = provider([503]);
    await run(createCoachModel(config("openai"), fake.fetcher, { random: () => 1 }));
    const gaps = fake.calls.slice(1).map((at, index) => at - fake.calls[index]!);
    expect(gaps).toEqual([500, 1_000, 2_000, 4_000]);
    expect([retryDelay(1, () => 0), retryDelay(3, () => 0), retryDelay(9, () => 1)]).toEqual([250, 1_000, coachRetry.maxDelayMs]);
  });

  it("waits as long as Retry-After says, and stops when that would pass the budget", async () => {
    const polite = provider([429, "ok"], { "retry-after": "2" });
    await run(createCoachModel(config("openai"), polite.fetcher));
    expect(polite.calls).toEqual([0, 2_000]);
    const later = provider([429], { "retry-after": "60" });
    const result = await run(createCoachModel(config("openai"), later.fetcher));
    expect(later.calls).toHaveLength(1);
    expect("error" in result && result.error.code).toBe("rate_limited");
  });

  it("never retries past the total budget (~20 s)", async () => {
    const slow = provider([429], { "retry-after": "8" });
    await run(createCoachModel(config("openai"), slow.fetcher));
    // 0, 8 s, 16 s; a third wait would end at 24 s.
    expect(slow.calls).toEqual([0, 8_000, 16_000]);
  });

  it("stops retrying once the request is cancelled", async () => {
    const fake = provider([503]);
    const controller = new AbortController();
    const result = await run(createCoachModel(config("openai"), fake.fetcher, { sleep: async () => controller.abort() }), controller.signal);
    expect("error" in result).toBe(true);
    expect(fake.calls).toHaveLength(1);
  });

  it("a ChatGPT 401 is auth_expired and not retried", async () => {
    const fake = provider([401]);
    const result = await run(createCoachModel(config("chatgpt"), fake.fetcher));
    expect(fake.calls).toHaveLength(1);
    expect("error" in result && coachErrorDto(result.error)).toMatchObject({ code: "auth_expired", provider: "chatgpt", retryable: false });
  });
});

describe("coach secrets", () => {
  const secret = Buffer.alloc(32, 7).toString("base64");
  it("round-trips, never stores the plaintext, and refuses a wrong or missing key", () => {
    const sealed = sealSecret("sk-live-abcd", secret);
    expect(sealed).not.toContain("sk-live");
    expect(sealSecret("sk-live-abcd", secret)).not.toBe(sealed);
    expect(openSecret(sealed, secret)).toBe("sk-live-abcd");
    expect(() => openSecret(sealed, Buffer.alloc(32, 8).toString("base64"))).toThrow();
    expect(() => sealSecret("x", "")).toThrow(CoachSecretError);
    expect(() => sealSecret("x", "short")).toThrow(CoachSecretError);
  });
});

describe("pickCoachProvider (ticket 17c)", () => {
  // "kind@day" configured that day; a trailing "!" cannot run (expired sign-in, undecryptable key).
  const list = (...items: string[]) => items.map(item => {
    const [kind, day] = item.replace("!", "").split("@");
    return { provider: kind as CoachModelKind, configuredAt: new Date(2026, 0, Number(day)), usable: !item.endsWith("!") };
  });
  it.each([
    { configured: [], chosen: null, selected: null, provider: null, fellBack: false },
    { configured: ["openai@1"], chosen: null, selected: "openai", provider: "openai", fellBack: false },
    { configured: ["openai@1", "anthropic@2"], chosen: null, selected: "anthropic", provider: "anthropic", fellBack: false },
    { configured: ["openai@1", "anthropic@2"], chosen: "openai", selected: "openai", provider: "openai", fellBack: false },
    // The pick was disconnected: the default (most recent), not a fallback.
    { configured: ["openai@1", "anthropic@2"], chosen: "ollama", selected: "anthropic", provider: "anthropic", fellBack: false },
    { configured: ["openai@1", "ollama@2", "chatgpt@3!"], chosen: "chatgpt", selected: "chatgpt", provider: "ollama", fellBack: true },
    { configured: ["openai@1", "chatgpt@3!"], chosen: null, selected: "chatgpt", provider: "openai", fellBack: true },
    { configured: ["openai@1!", "chatgpt@3!"], chosen: "openai", selected: "openai", provider: null, fellBack: true },
  ])("$configured, picked $chosen: $provider", ({ configured, chosen, selected, provider, fellBack }) => {
    const result = pickCoachProvider(list(...configured), chosen as CoachModelKind | null);
    expect({ selected: result.selected?.provider ?? null, provider: result.provider?.provider ?? null, fellBack: result.fellBack }).toEqual({ selected, provider, fellBack });
  });
});

describe("nextCoachProvider (ticket 17c)", () => {
  it.each([
    { usable: [], current: null, next: null },
    { usable: ["openai"], current: "openai", next: "openai" },
    { usable: ["chatgpt", "openai", "ollama"], current: "chatgpt", next: "openai" },
    { usable: ["chatgpt", "openai", "ollama"], current: "ollama", next: "chatgpt" },
    { usable: ["chatgpt", "openai"], current: "anthropic", next: "chatgpt" },
    { usable: ["chatgpt", "openai"], current: null, next: "chatgpt" },
  ])("$current in $usable: $next", ({ usable, current, next }) => {
    expect(nextCoachProvider(usable as CoachModelKind[], current as CoachModelKind | null)).toBe(next);
  });
});
