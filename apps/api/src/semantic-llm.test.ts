import { describe, expect, it, vi } from "vitest";
import { createRambleSession } from "@todalo/ramble";
import { createSemanticProcessor } from "./semantic-llm";
import type { SemanticInput } from "@todalo/ramble/semantic";
import { operation } from "../test-fixtures/semantic";

const env = { GEMINI_API_KEY: "test-server-secret" };
const input = (): SemanticInput => ({ text: "I need to call Anna", state: createRambleSession(), timeZone: "Europe/Zurich", projects: [{ id: "work", name: "Work" }], recentSpeech: [] });
const response = (operations: unknown[] = []) => Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ operations }) }] } }] });

describe("model adapter", () => {
  it("executes only exact standalone control phrases without model inference", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(response());
    const processor = createSemanticProcessor(env, request);
    for (const [text, type] of [["sub-task.", "sub-task"], ["top level", "top-level"], ["undo", "undo"], ["done!", "end"]]) {
      expect((await processor.process({ ...input(), text }, new AbortController().signal))[0].type).toBe(type);
    }
    expect(request).not.toHaveBeenCalled();
    await processor.process({ ...input(), text: "The report is done but I need to send it" }, new AbortController().signal);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("runs local Ollama with schema-constrained output and thinking disabled", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ done: true, done_reason: "stop", message: { content: '{"operations":[]}' } }));
    await createSemanticProcessor({ RAMBLE_LLM_PROVIDER: "ollama", RAMBLE_LLM_MODEL: "qwen3:4b" }, request).process(input(), new AbortController().signal);
    expect(String(request.mock.calls[0][0])).toBe("http://127.0.0.1:11434/api/chat");
    expect(JSON.parse(request.mock.calls[0][1]?.body as string)).toMatchObject({ think: false, stream: false, format: { type: "object" } });
    expect(() => createSemanticProcessor({ RAMBLE_LLM_PROVIDER: "ollama", RAMBLE_LLM_MODEL: "qwen3:4b", RAMBLE_LLM_BASE_URL: "https://remote.example" }).assertConfigured()).toThrow("loopback");
  });
  it("keeps credentials in server headers and requests strict low-effort JSON", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(response([operation({ type: "create", text: "Call Anna" })]));
    const processor = createSemanticProcessor(env, request);
    const result = await processor.process(input(), new AbortController().signal);
    expect(result[0].text).toBe("Call Anna");
    const [url, options] = request.mock.calls[0];
    expect(String(url)).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent");
    expect(options?.headers).toMatchObject({ "x-goog-api-key": "test-server-secret" });
    const body = JSON.parse(options?.body as string);
    expect(body).toMatchObject({ generationConfig: { maxOutputTokens: 4096,
      thinkingConfig: { thinkingLevel: "MINIMAL", includeThoughts: false },
      responseFormat: { text: { mimeType: "APPLICATION_JSON" } } } });
    expect(body.generationConfig.responseFormat.text.schema).toHaveProperty("properties.operations");
    expect(JSON.stringify(body)).not.toContain(env.GEMINI_API_KEY);
    const context = JSON.parse(body.contents[0].parts[0].text);
    expect(context).not.toHaveProperty("undoStack");
    expect(context).not.toHaveProperty("userId");
  });
  it("bounds context and never sends full undo history or the full session transcript", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(response());
    const data = input(); data.recentSpeech = Array.from({ length: 30 }, () => "x".repeat(4000));
    await createSemanticProcessor(env, request).process(data, new AbortController().signal);
    const body = JSON.parse(request.mock.calls[0][1]?.body as string);
    const context = JSON.parse(body.contents[0].parts[0].text);
    expect(context.previousSegments).toHaveLength(4);
    expect(context.previousSegments[0]).toHaveLength(1000);
  });
  it("supports local compatible inference with an explicit model and no remote credential", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ choices: [{ finish_reason: "stop", message: { content: '{"operations":[]}' } }] }));
    await createSemanticProcessor({ RAMBLE_LLM_PROVIDER: "compatible", RAMBLE_LLM_BASE_URL: "http://localhost:11434/v1", RAMBLE_LLM_MODEL: "gpt-oss:20b" }, request)
      .process(input(), new AbortController().signal);
    expect(String(request.mock.calls[0][0])).toBe("http://localhost:11434/v1/chat/completions");
    expect(JSON.parse(request.mock.calls[0][1]?.body as string)).not.toHaveProperty("reasoning_effort");
  });
  it("rejects missing credentials and insecure remote endpoints before making a request", async () => {
    const request = vi.fn<typeof fetch>();
    await expect(createSemanticProcessor({}, request).process(input(), new AbortController().signal)).rejects.toThrow("not configured");
    expect(() => createSemanticProcessor({ RAMBLE_LLM_PROVIDER: "compatible", RAMBLE_LLM_MODEL: "local", RAMBLE_LLM_BASE_URL: "http://remote.example/v1" }, request).assertConfigured()).toThrow("HTTPS");
    expect(request).not.toHaveBeenCalled();
  });
  it("does not accept truncation, refusal, invalid schemas or error bodies as task output", async () => {
    for (const invalid of [Response.json({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: '{"operations":[]}' }] } }] }),
      Response.json({ promptFeedback: { blockReason: "SAFETY" } }),
      response([{ type: "create", text: "Missing fields" }]), new Response("private provider details", { status: 429 })]) {
      const request = vi.fn<typeof fetch>().mockResolvedValue(invalid);
      await expect(createSemanticProcessor(env, request).process(input(), new AbortController().signal)).rejects.toThrow();
    }
  });
  it("propagates the discard signal to the network request", async () => {
    const controller = new AbortController();
    const request = vi.fn<typeof fetch>().mockImplementation(async (_url, options) => {
      expect(options?.signal?.aborted).toBe(true);
      throw new DOMException("Aborted", "AbortError");
    });
    controller.abort();
    await expect(createSemanticProcessor(env, request).process(input(), controller.signal)).rejects.toThrow("Aborted");
  });
});
