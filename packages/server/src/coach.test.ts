import { describe, expect, it } from "vitest";
import {
  chatRequest, CoachModelError, createCoachModel, explanationFacts, explanationMessages, explanationSchema, failureMessage, ollamaUrl, parseCompletion, parseExplanation, parsePing,
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
