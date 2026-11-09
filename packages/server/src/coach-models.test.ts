import { describe, expect, it } from "vitest";
import { curatedModels, modelOptions, modelTag, parseModels } from "./coach-models";
import { coachProviderInfo, type CoachModelKind } from "./coach";

describe("modelTag", () => {
  it.each<[CoachModelKind, string, ReturnType<typeof modelTag>]>([
    ["openai", "gpt-6-astra", "hard"],
    ["openai", "gpt-6.1-sol", "balanced"],
    ["chatgpt", "gpt-6.1-sol", "balanced"],
    ["openai", "gpt-6.1-terra", "fast"],
    ["chatgpt", "gpt-6-luna", "fast"],
    ["chatgpt", "gpt-5.5", "hard"],
    ["openai", "gpt-5.5-2026-08-01", "hard"],
    ["openai", "gpt-5.4-mini", "fast"],
    ["openai", "o3", "hard"],
    ["openai", "o4-mini", "fast"],
    ["anthropic", "claude-fable-5-1", "hard"],
    ["anthropic", "claude-opus-5-5", "hard"],
    ["anthropic", "claude-sonnet-5-5", "balanced"],
    ["anthropic", "claude-haiku-5-5", "fast"],
    ["openrouter", "google/gemini-4-argon", "hard"],
    ["openrouter", "google/gemini-3.8-flash", "balanced"],
    ["openrouter", "google/gemini-3.8-flash:free", "balanced"],
    ["openrouter", "google/gemini-3.5-flash-lite", "fast"],
    ["openrouter", "x-ai/grok-4.7", "hard"],
    ["openrouter", "deepseek/deepseek-v4-pro-0813", "hard"],
    ["openrouter", "deepseek/deepseek-v4.1-flash-1017", "fast"],
    ["openrouter", "qwen/qwen3.8-max-prime", "hard"],
    ["openrouter", "qwen/qwen3.8-flash", "fast"],
    ["openrouter", "mistralai/mistral-large-4-0", "balanced"],
    ["ollama", "ministral-3:8b", "local"],
    ["openai", "gpt-4o", null],
    ["openrouter", "meta-llama/llama-4-maverick", null],
  ])("%s %s → %s", (provider, id, tag) => expect(modelTag(provider, id)).toBe(tag));

  it("hints every curated model and lists each provider's recommended default first", () => {
    for (const [provider, ids] of Object.entries(curatedModels) as [CoachModelKind, string[]][]) {
      expect(ids[0]).toBe(coachProviderInfo[provider].model);
      for (const id of ids) expect(modelTag(provider, id), id).not.toBeNull();
    }
  });
});

describe("parseModels", () => {
  it("keeps OpenAI chat models only, with their release time", () => {
    const ids = ["gpt-6-astra", "text-embedding-3-small", "tts-1-hd", "whisper-1", "dall-e-3", "omni-moderation-latest", "gpt-image-1", "gpt-4o-audio-preview", "gpt-realtime", "gpt-4o-transcribe"];
    expect(parseModels("openai", { data: ids.map(id => ({ id, created: 1_790_000_000 })) })).toEqual([{ id: "gpt-6-astra", created: 1_790_000_000_000 }]);
  });
  it("keeps OpenRouter chat models with JSON output only", () => {
    const data = [{ id: "google/gemini-3.8-flash", supported_parameters: ["response_format"] }, { id: "google/gemini-2.5-flash-image", supported_parameters: ["response_format"] }, { id: "x/plain", supported_parameters: ["temperature"] }];
    expect(parseModels("openrouter", { data })).toEqual([{ id: "google/gemini-3.8-flash", created: null }]);
  });
  it("reads Anthropic's created_at and Ollama tags, and tolerates a malformed reply", () => {
    expect(parseModels("anthropic", { data: [{ id: "claude-fable-5-1", created_at: "2026-10-01T00:00:00Z" }] })).toEqual([{ id: "claude-fable-5-1", created: Date.parse("2026-10-01T00:00:00Z") }]);
    expect(parseModels("ollama", { models: [{ name: "ministral-3:8b" }] })).toEqual([{ id: "ministral-3:8b", created: null }]);
    expect(parseModels("anthropic", null)).toEqual([]);
  });
});

describe("modelOptions", () => {
  it("puts the recommended one first, then newest first, then models over a year old (marked older)", () => {
    const now = Date.parse("2026-11-09T00:00:00Z");
    const at = (iso: string) => Date.parse(iso);
    const options = modelOptions("openai", [
      { id: "gpt-4o", created: at("2024-05-13T00:00:00Z") },
      { id: "gpt-6.1-sol", created: at("2026-10-20T00:00:00Z") },
      { id: "gpt-6.1-terra", created: at("2026-10-01T00:00:00Z") },
      { id: "gpt-6-astra", created: at("2026-09-10T00:00:00Z") },
      { id: "gpt-6.1-sol", created: at("2026-10-20T00:00:00Z") },
    ], now);
    expect(options.map(({ id, older }) => [id, older])).toEqual([["gpt-6.1-terra", false], ["gpt-6.1-sol", false], ["gpt-6-astra", false], ["gpt-4o", true]]);
    expect(options[0]).toMatchObject({ recommended: true, hint: "Fast & cheap" });
  });
});
