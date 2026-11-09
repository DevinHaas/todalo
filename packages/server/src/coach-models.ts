// Settings › Coach model picker: list a provider's models with its own
// credentials, plus a short hint per well-known family. Pure apart from the
// injected fetch; the client imports the DTO and hints from here.
import { z } from "zod";
import { anthropicVersion, chatgptBaseUrl, coachErrorDto, coachProviderInfo, CoachModelError, httpFailure, ollamaDefaultUrl, ollamaUrl, type CoachErrorDto, type CoachModelKind } from "./coach";

export type ModelTag = "hard" | "balanced" | "fast" | "local";
export const modelTagLabels: Record<ModelTag, string> = {
  hard: "Best for hard tasks", balanced: "Balanced", fast: "Fast & cheap", local: "Local, private",
};
/** `created`: when the provider released it (ms), if it says; `older`: over a year old, listed under "Older models". */
export interface CoachModelOption { id: string; tag: ModelTag | null; hint: string | null; recommended: boolean; created: number | null; older: boolean }
/** One model in a provider's list reply. */
export interface ListedModel { id: string; created: number | null }
/** POST /coach/models?provider= body: a key or Ollama address typed but not saved yet (else the saved ones are used). */
export const coachModelsInput = z.strictObject({
  apiKey: z.string().trim().min(8).max(500).nullish(),
  baseUrl: z.string().trim().max(500).nullish(),
});
/** `fallback`: the provider could not be asked, so this is the short built-in list (and why). */
export interface CoachModelsDto { models: CoachModelOption[]; fallback: boolean; message?: string; /** Ticket 17d: the failed call, when the provider was asked. */ error?: CoachErrorDto }

/**
 * First match wins, tested against the id without an OpenRouter "vendor/"
 * prefix or ":variant" suffix. ponytail: a regex table, no model registry;
 * new families show no hint until a row is added here.
 */
const hintTable: [RegExp, ModelTag][] = [
  [/^o\d+(-pro)?(-\d{4}-\d{2}-\d{2})?$/, "hard"], // o-series reasoning (o4-mini falls through to fast)
  [/^gemini-[\d.]+-flash$/, "balanced"], // Gemini Flash is Google's middle tier; other vendors' flash is their small one
  [/\b(nano|mini|haiku|flash|lite|small|terra|luna|fast)\b/, "fast"], // \b: "gemini" is not a mini
  [/\b(astra|fable|opus|argon|max|pro|grok)\b/, "hard"],
  [/\b(sol|sonnet|large)\b/, "balanced"],
  [/^gpt-\d+(\.\d+)?(-\d{4}-\d{2}-\d{2})?$/, "hard"], // a plain flagship, e.g. gpt-5.5
];

export function modelTag(provider: CoachModelKind, id: string): ModelTag | null {
  if (provider === "ollama") return "local";
  const bare = id.toLowerCase().replace(/^[^/]+\//, "").replace(/:.*$/, "");
  return hintTable.find(([pattern]) => pattern.test(bare))?.[1] ?? null;
}

/** Shown when the provider's list cannot be read; the recommended (default) model first. */
export const curatedModels: Record<CoachModelKind, string[]> = {
  // ChatGPT plans (Codex sign-in): Plus/Pro/Business get gpt-6.1-sol, Free/Go gpt-6-luna (2026-11).
  chatgpt: ["gpt-6.1-sol", "gpt-6-luna"],
  openai: ["gpt-6.1-terra", "gpt-6-astra", "gpt-6.1-sol", "gpt-6-luna"],
  anthropic: ["claude-sonnet-5-5", "claude-fable-5-1", "claude-opus-5-5", "claude-haiku-5-5"],
  openrouter: [
    "google/gemini-3.8-flash", "google/gemini-4-argon", "google/gemini-3.5-flash-lite", "x-ai/grok-4.7", "deepseek/deepseek-v4-pro-0813",
    "deepseek/deepseek-v4.1-flash-1017", "qwen/qwen3.8-max-prime", "qwen/qwen3.8-flash", "mistralai/mistral-large-4-0",
  ],
  ollama: ["ministral-3:8b"],
};

/** OpenAI (and OpenRouter) list image, audio and embedding models too; the Coach only uses chat ones. */
const notChat = /(embed|tts|whisper|dall-e|moderation|image|audio|realtime|transcribe|search|computer-use|davinci|babbage|sora)/;

/** The list request for a provider; null when it cannot be asked (Ollama off localhost). */
export function modelsRequest(provider: CoachModelKind, apiKey: string | null, baseUrl: string | null): { url: string; headers: Record<string, string> } | null {
  const bearer: Record<string, string> = apiKey ? { authorization: `Bearer ${apiKey}` } : {};
  switch (provider) {
    case "openai": case "chatgpt": return { url: `${chatgptBaseUrl}/models`, headers: bearer };
    case "anthropic": return { url: "https://api.anthropic.com/v1/models?limit=1000", headers: { "anthropic-version": anthropicVersion, ...apiKey ? { "x-api-key": apiKey } : {} } };
    case "openrouter": return { url: "https://openrouter.ai/api/v1/models", headers: bearer };
    case "ollama": { const base = ollamaUrl(baseUrl ?? ollamaDefaultUrl); return base ? { url: `${base}/api/tags`, headers: {} } : null; }
  }
}

/** Release time in ms: OpenAI and OpenRouter send `created` (unix seconds), Anthropic `created_at` (ISO). */
const releasedAt = (model: { created?: unknown; created_at?: unknown }) =>
  typeof model.created === "number" ? model.created * 1000 : typeof model.created_at === "string" && Date.parse(model.created_at) || null;

/** The models in a provider's list reply (chat models only). Ollama's dates are pull times, so none. */
export function parseModels(provider: CoachModelKind, body: unknown): ListedModel[] {
  const reply = body as { data?: { id?: unknown; supported_parameters?: unknown; created?: unknown; created_at?: unknown }[]; models?: { name?: unknown }[] } | null;
  if (provider === "ollama") return (reply?.models ?? []).map(model => model.name).filter((name): name is string => typeof name === "string").map(id => ({ id, created: null }));
  return (reply?.data ?? []).filter(model => typeof model.id === "string").filter(model =>
    provider === "openai" || provider === "chatgpt" ? !notChat.test(model.id as string)
    // The Coach asks for JSON-schema replies (require_parameters), so OpenRouter models without it would fail.
    : provider === "openrouter" ? !notChat.test(model.id as string) && (!Array.isArray(model.supported_parameters) || model.supported_parameters.includes("response_format") || model.supported_parameters.includes("structured_outputs"))
    : true).map(model => ({ id: model.id as string, created: releasedAt(model) }));
}

const YEAR_MS = 365 * 86_400_000;

/**
 * Recommended first, then newest first (so the list does not go stale with
 * the table); models without a date keep the provider's order. Over a year
 * old: `older` (the picker lists them under "Older models").
 */
export function modelOptions(provider: CoachModelKind, listed: ListedModel[], now = Date.now()): CoachModelOption[] {
  const recommended = coachProviderInfo[provider].model;
  const seen = new Set<string>();
  return listed.filter(({ id }) => !seen.has(id) && seen.add(id)).map(({ id, created }) => {
    const tag = modelTag(provider, id);
    return { id, tag, hint: tag && modelTagLabels[tag], recommended: id === recommended, created, older: created !== null && now - created > YEAR_MS };
  }).sort((a, b) => Number(b.recommended) - Number(a.recommended) || Number(a.older) - Number(b.older) || (b.created ?? 0) - (a.created ?? 0));
}

export const fallbackModels = (provider: CoachModelKind, message: string): CoachModelsDto =>
  ({ models: modelOptions(provider, curatedModels[provider].map(id => ({ id, created: null }))), fallback: true, message });

/** Asks the provider for its models; any failure becomes the curated list with a reason (never the key). */
export async function listCoachModels(provider: CoachModelKind, apiKey: string | null, baseUrl: string | null, fetcher: typeof fetch = fetch, signal?: AbortSignal, now = Date.now()): Promise<CoachModelsDto> {
  const request = modelsRequest(provider, apiKey, baseUrl);
  if (!request) return fallbackModels(provider, "Ollama must run on this computer: use a localhost address.");
  let response: Response;
  try {
    response = await fetcher(request.url, { headers: request.headers, signal: AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(10_000)]) });
  } catch {
    const message = provider === "ollama" ? "Could not reach Ollama. Is it running?" : "Could not reach the provider.";
    return { ...fallbackModels(provider, message), error: coachErrorDto(new CoachModelError(message, "network", provider)) };
  }
  if (!response.ok) { await response.body?.cancel(); return { ...fallbackModels(provider, `The provider did not list its models (${response.status}).`), error: coachErrorDto(httpFailure(response.status, provider)) }; }
  const listed = parseModels(provider, await response.json().catch(() => null));
  if (!listed.length) return fallbackModels(provider, "The provider listed no models the Coach can use.");
  return { models: modelOptions(provider, listed, now), fallback: false };
}
