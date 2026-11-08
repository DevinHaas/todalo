import { describe, expect, it } from "vitest";
import {
  anthropicRequest, chatgptRequest, chatRequest, CoachModelError, createCoachModel, parseAnthropic, parseChatgptStream, explanationFacts, explanationMessages, explanationSchema, failureMessage, ollamaUrl, parseCompletion, parseExplanation, parsePing,
  type CoachConfig,
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
    [config("anthropic"), 402, "The provider is rate limiting this key or it is out of credit."],
    [config("anthropic"), 529, "The provider is unavailable. Try again later."],
  ])("maps %o %i", async (cfg, status, message) => {
    const { fetcher } = fake(new Response("{}", { status }));
    await expect(createCoachModel(cfg, fetcher).complete({ messages: [] })).rejects.toThrow(message);
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
  it("maps HTTP failures and unreachable hosts to messages the user can act on", async () => {
    const failing = (status: number) => createCoachModel(config("openai"), async () => new Response("{}", { status }));
    await expect(failing(401).complete({ messages: [] })).rejects.toThrow("rejected the API key");
    await expect(failing(429).complete({ messages: [] })).rejects.toThrow(failureMessage(429));
    const offline = createCoachModel(config("ollama"), async () => { throw new TypeError("fetch failed"); });
    await expect(offline.complete({ messages: [] })).rejects.toThrow("Could not reach Ollama");
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
