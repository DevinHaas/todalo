# Ramble transcript post-processing model selection

Research date: **2026-10-03**. Scope: interpret finalized speech transcripts into staged task creation, correction, deletion, hierarchy, and ignore operations; compare Fish transcription and a fully local alternative. LLM prices are USD per million tokens, standard online inference. Speech prices are per audio hour. All were checked against primary sources on the research date. Initial documentation research made no inference calls; subsequent implementation validation included actual local calls and Google free-project calls. The measured development results below are separate from published provider claims and illustrative paid-price estimates.

## Summary

Use **Google's official Gemini API with stable `gemini-3.5-flash-lite` and minimal thinking**, following the user's explicit provider/model choice. Its documented extraction focus, structured output support, and current new-project recommendation make it a reasonable starting point. The illustrative LLM-only cost is **$0.029 per session**, with no dedicated model-hosting infrastructure required. Keep the competing prices and proxy benchmarks below for future evaluation; the choice is **not a demonstrated universal intelligence or latency winner**. [Google model specification](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite), [thinking controls](https://ai.google.dev/gemini-api/docs/thinking), checked 2026-10-03.

The selected architecture separates speech recognition from bounded text interpretation. **Fish offers file-based ASR, not a documented standalone streaming transcription WebSocket**; it requires utterance segmentation before upload. The validated local development configuration is multilingual Whisper through whisper.cpp plus Ollama **`qwen3.5:4b`**, replacing the rejected older `qwen3:4b` candidate. That avoids provider request charges when both services run locally, while still requiring downloaded weights, memory, electricity, and running inference services. Its 18 passing development cases are not an independent accuracy benchmark; microphone use remains unvalidated in this run.

## Detailed findings

### Current model and price comparison

Published generation rates below are **provider claims**, not end-to-end latency, independent workload measurements, or SLAs. Context figures describe capacity; Ramble should use much smaller bounded context. Source pages without publication dates are marked as checked 2026-10-03.

| Provider and exact model ID | Input / output per 1M | Context capacity | Structured output and speed evidence | Selection implication |
| --- | ---: | ---: | --- | --- |
| Groq `openai/gpt-oss-120b` | $0.15 / $0.60 | 131,072 | Strict JSON Schema; approximately 500 tokens/s | Alternative with stronger open-model reasoning than 20B at a small absolute cost |
| Groq `openai/gpt-oss-20b` | $0.075 / $0.30 | 131,072 | Strict JSON Schema; approximately 1,000 tokens/s | Cheapest shortlisted production model with an advertised high generation rate |
| OpenAI `gpt-6-luna` | $0.10 / $0.50 | 1,050,000 | Structured outputs; supports reasoning `none`; no comparable tokens/s established here | Strong low-cost candidate for a quality/latency bake-off |
| Gemini `gemini-3.5-flash-lite` | $0.30 / $2.50 | 1,048,576 input | Structured outputs; minimal thinking; no comparable absolute tokens/s established here | **Selected default**, using Google's official API |
| Gemini `gemini-3.1-flash-lite` | $0.25 / $1.50 | 1,048,576 input | Structured outputs | Still stable; lower price than 3.5, but not the current new-project recommendation |
| Gemini `gemini-3.8-flash` | $0.75 / $3.75 through 2026-12-31 | 1,048,576 input | Structured outputs; low thinking minimum | Higher capability tier; price rises to $1.50 / $7.50 on 2027-01-01 |
| Cerebras `gpt-oss-120b` | $0.35 / $0.75 | 131,072 paid | Strict JSON Schema; approximately 3,000 tokens/s | Same-model alternative to benchmark when generation speed matters |
| OpenAI `gpt-5.4-nano` | $0.20 / $1.25 | 400,000 | Structured outputs; model page marked deprecated | Historical nano comparison; prefer evaluating current Luna for new work |
| OpenAI `gpt-5.4-mini` | $0.75 / $4.50 | 400,000 | Structured outputs; reasoning `none` | More expensive previous-generation mini baseline |
| Gemini `gemini-2.5-flash-lite` | $0.10 / $0.40 | 1,048,576 input | Structured outputs; thinking off by default | Access restricted to prior active users; unsuitable as a new-project default |
| Groq `llama-3.1-8b-instant` | Contact sales | 131,072 | Approximately 560 tokens/s; JSON object mode rather than the listed strict-schema models | Old $0.05 / $0.08 public pricing is not supported by the current catalog |

Sources checked 2026-10-03: [Groq production model catalog](https://console.groq.com/docs/models), [Groq GPT-OSS 20B specification](https://console.groq.com/docs/model/openai/gpt-oss-20b), [OpenAI Luna specification](https://developers.openai.com/api/docs/models/gpt-6-luna), [OpenAI current pricing](https://developers.openai.com/api/docs/pricing), [nano specification](https://developers.openai.com/api/docs/models/gpt-5.4-nano), [mini specification](https://developers.openai.com/api/docs/models/gpt-5.4-mini), [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing), [3.5 Flash-Lite specification](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite), [3.1 Flash-Lite specification](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite), [3.8 Flash specification](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash), [Cerebras current public model metadata](https://api.cerebras.ai/public/v1/models/gpt-oss-120b), [Cerebras model catalog](https://inference-docs.cerebras.ai/models/overview). The Cerebras metadata's per-token prices were multiplied by 1,000,000. Its older launch pricing is superseded by this current metadata.

Google's **2026-09-18** release note restricts Gemini 2.5 access to prior active users and directs new projects to 3.5 Flash-Lite or 3.8 Flash. The 3.5 Flash-Lite stable release is dated **2026-07-21**. OpenAI released Luna on **2026-09-22**. [Google release notes](https://ai.google.dev/gemini-api/docs/changelog), [OpenAI changelog](https://developers.openai.com/api/docs/changelog).

### Competing open-model quality evidence

The original OpenAI model card, published **August 2025**, reports these **low-reasoning** results:

| Proxy benchmark | GPT-OSS 120B | GPT-OSS 20B |
| --- | ---: | ---: |
| Tau-Bench Retail, tool interactions | 49.4% | 35.0% |
| Tau-Bench Airline, tool interactions | 42.6% | 32.0% |
| MMMLU multilingual average | 74.1% | 67.0% |
| MMMLU German | 78.6% | 71.4% |

These support preferring 120B for corrections and mixed-language task interpretation, but do **not** measure Ramble extraction accuracy. MMMLU tests knowledge questions across 14 translated languages; it does not establish Swiss German transcription or task-command reliability. The report also finds factual hallucination weaknesses in both models. The source is over 12 months old, but remains relevant to these unchanged base weights; host settings and serving changes still need separate evaluation. [OpenAI-authored GPT-OSS model card, tables 2–3 and section 4.5](https://arxiv.org/html/2508.10925v1).

No primary source found supplies a directly comparable Ramble intent-extraction score for current Luna, Gemini, and GPT-OSS. Academic/math/code rankings should not be relabeled as task intent accuracy. These results motivate evaluating 120B as an alternative; they do not contradict the user's Gemini choice or establish Gemini's relative Ramble quality.

### Cost per session

Illustrative assumptions, **not observed usage**: 20 finalized utterance requests; average 1,500 input tokens per request including instructions, recent transcript, project names, and staged task context; average **400 billed output tokens**, including any reasoning tokens, per request. Total: **30,000 input + 8,000 output tokens**. Formula: `(input tokens × input rate + billed output tokens × output rate) / 1,000,000`. No caching, batching, free tier, or promotional credits assumed, except the explicitly dated 3.8 price.

| Model/host | Example session | 1,000 such sessions |
| --- | ---: | ---: |
| Groq GPT-OSS 20B | $0.00465 | $4.65 |
| Groq GPT-OSS 120B | $0.00930 | $9.30 |
| OpenAI GPT-6 Luna | $0.00700 | $7.00 |
| Cerebras GPT-OSS 120B | $0.01650 | $16.50 |
| Gemini 3.1 Flash-Lite | $0.01950 | $19.50 |
| **Gemini 3.5 Flash-Lite, selected** | **$0.02900** | **$29.00** |
| Gemini 3.8 Flash, 2026 promotional rate | $0.05250 | $52.50 |
| OpenAI GPT-5.4 nano | $0.01600 | $16.00 |
| OpenAI GPT-5.4 mini | $0.05850 | $58.50 |

These are arithmetic estimates using the cited rates, **LLM post-processing only**. They exclude transcription, application hosting, database/network costs, taxes, retries, additional requests, and regional pricing premiums. A fivefold increase in input context raises the 120B example to $0.02730; averaging 1,000 billed output tokens per utterance raises it to $0.01650. Reasoning controls and request cadence can outweigh small differences in nominal token prices.

Relative to the selected Gemini model, Groq 20B saves $0.02435 per example session and Groq 120B saves $0.01970. Those estimates alone do not justify a provider switch: task quality, actual reasoning/output usage, retries, availability, and latency should be measured first.

### Protocol and schema recommendations

The selected Google REST request is `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent`, authenticated by server-side `x-goog-api-key` and `Content-Type: application/json`. The current preferred configuration is:

```json
{
  "systemInstruction": { "parts": [{ "text": "Task interpretation instructions" }] },
  "contents": [{ "role": "user", "parts": [{ "text": "Bounded transcript and session context" }] }],
  "generationConfig": {
    "thinkingConfig": { "thinkingLevel": "MINIMAL", "includeThoughts": false },
    "maxOutputTokens": 4096,
    "responseFormat": {
      "text": { "mimeType": "APPLICATION_JSON", "schema": { "type": "object" } }
    }
  }
}
```

The schema above is a placeholder; supply the complete operations schema. The current reference recommends `responseFormat` over deprecated `responseSchema`/`_responseJsonSchema`; `responseJsonSchema` is also listed, but its description contains an apparent editorial typo. Use the current `responseFormat.text.schema` envelope and **no OpenAI `strict` flag**. [Google generateContent reference](https://ai.google.dev/api/generate-content), checked 2026-10-03.

`MINIMAL` is supported and is the model's default; explicitly set it for reproducibility. `thinkingLevel` is the recommended Gemini 3 control; omit the older integer `thinkingBudget`. Minimal means little-to-no thinking, not guaranteed zero thought tokens. Hiding thoughts does not remove their cost. Google deprecated sampling controls `temperature`, `top_p`, and `top_k` on 2026-07-21; omit those fields. [Google thinking guide](https://ai.google.dev/gemini-api/docs/thinking), [release notes](https://ai.google.dev/gemini-api/docs/changelog).

Google's documented schema subset supports `additionalProperties`, `required`, `anyOf`, enums, arrays, and nullable types. Keep closed objects and validate locally; a schema-compliant operation can still target the wrong task. Parse candidate text parts while excluding parts marked `thought`, and reject missing, blocked, or truncated candidates. [Google structured output guide](https://ai.google.dev/gemini-api/docs/structured-output), checked 2026-10-03.

For this text-only, no-tool request, record `usageMetadata.promptTokenCount`, `candidatesTokenCount`, `thoughtsTokenCount`, and `totalTokenCount`; billed generated tokens are **candidate + thought tokens**. The documented total is prompt + thoughts + candidates. Do not sum `totalTokenCount` with the subtotals or count thought summaries as the full reasoning usage. These distinctions keep price estimates honest. [Google usage metadata reference](https://ai.google.dev/api/generate-content#UsageMetadata), [thinking pricing](https://ai.google.dev/gemini-api/docs/thinking#pricing), checked 2026-10-03.

The remaining protocols describe alternatives for future evaluation, not the selected production provider.

Groq: `POST https://api.groq.com/openai/v1/chat/completions`, server-side Bearer authentication. Use `model: "openai/gpt-oss-120b"`, `reasoning_effort: "low"`, `stream: false`, and `response_format: { type: "json_schema", json_schema: { name, strict: true, schema } }`. All object properties must be required, every object must set `additionalProperties: false`, and nullable unions represent optional values. Strict schema and the low setting are documented capabilities; the exact combined request has not been exercised here. Groq currently excludes streaming and simultaneous tool use from this structured-output mode. [Groq structured outputs](https://console.groq.com/docs/structured-outputs), checked 2026-10-03.

Both GPT-OSS variants support low/medium/high, **not** `none`. `include_reasoning: false` omits reasoning text from the returned response; it does not prove reasoning tokens disappear from billing. Do not also set `reasoning_format`. Use the documented `max_completion_tokens` parameter; `max_tokens` is deprecated. Start with a bounded completion allowance such as 2,048–4,096, reject truncation, and measure actual billed token use rather than assuming the allowance is consumption. The catalog's completion ceiling is 65,536. [Groq reasoning guide](https://console.groq.com/docs/reasoning), [Groq API reference](https://console.groq.com/docs/api-reference), checked 2026-10-03.

For OpenAI Luna, use `POST https://api.openai.com/v1/responses` and `reasoning: { effort: "none" }` for the latency-sensitive baseline. Strict structured output belongs in `text.format` with `type: "json_schema"`, `name`, `schema`, and `strict: true`; this differs from Chat Completions' `response_format` envelope. [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), checked 2026-10-03. Luna's model page confirms this model supports the required feature and the no-reasoning setting.

Cerebras accepts an OpenAI-compatible chat-completion request at `https://api.cerebras.ai/v1/chat/completions`; it lists strict JSON support for `gpt-oss-120b`. Its current public metadata completion ceiling is 40,960, different from Groq's. [Cerebras structured output guide](https://inference-docs.cerebras.ai/capabilities/structured-outputs), [public metadata](https://api.cerebras.ai/public/v1/models/gpt-oss-120b), checked 2026-10-03.

Return an **operations array**, not executable SQL or direct database tools. Suggested bounded operations: `create`, `update`, `delete`, `set_mode`, `undo`, `ignore`, with explicit staged IDs and nulls for unspecified values. Validate schema, staged IDs, project membership, parent depth, text lengths, date interpretation, and every operation on the server before changing the session. Commit only through the existing explicit save boundary. Both Google and Groq distinguish schema correctness from semantic correctness. [Google structured output best practices](https://ai.google.dev/gemini-api/docs/structured-output), [Groq structured outputs](https://console.groq.com/docs/structured-outputs), checked 2026-10-03.

### Latency and throughput optimization

Measure **final transcript arrival → validated staging update**, including request queuing, input processing, reasoning, generation, network, and application work. The published 500/1,000/3,000 tokens/s figures cover generation and do not predict p95 completion time for short JSON. A faster advertised decoder can still lose on first-token time, reasoning length, network region, or congestion.

Implementation recommendations (engineering judgment): process finalized utterances once; coalesce closely adjacent finals before starting work where useful; serialize session mutations; limit in-flight requests; bound recent history and staged context; cancel obsolete requests; ignore empty/noise input; cache only genuinely repeatable work; use short schemas and short outputs; preserve a pending correction on failure. Never reprocess every partial transcript, resend an unbounded full conversation, or silently turn arbitrary failed-model transcripts into tasks. Log model ID, input/output usage, duration, timeout/retry rate, and operation outcome without logging personal transcript content by default.

Evaluate hosted alternatives on the same corpus and load, measuring correct operation/type/target, false task creation from filler, missed task creation, correction accuracy, unsupported project references, multilingual/code-switch performance, JSON/truncation failures, p50/p95 latency, and cost per successful session. Include English, German, French, Italian, negation, interruptions, quoted commands, multiple tasks in a sentence, and relative dates near midnight/DST. Score a holdout set; model selection changes should require a meaningful quality improvement or cost/latency gain with quality preserved.

### Hosting economics

Both GPT-OSS variants have Apache 2.0 weights and use Harmony formatting. Official model cards describe 120B fitting on a single 80 GB GPU and 20B within 16 GB memory under MXFP4; these fit claims are not guarantees for a specific context length, concurrency, serving stack, or speed target. Include KV cache, runtime memory, and concurrency headroom. [OpenAI's 120B model repository](https://huggingface.co/openai/gpt-oss-120b), [20B model repository](https://huggingface.co/openai/gpt-oss-20b), original release August 2025, checked 2026-10-03. These release-era sources are over 12 months old; validate against the selected runtime version.

The current vLLM docs expose an OpenAI-compatible JSON Schema `response_format` and support reasoning plus structured output. Keep endpoint and model configurable, but test the chosen runtime's request parameters and schema restrictions rather than assuming every compatible server implements Groq extensions. [vLLM structured outputs](https://docs.vllm.ai/en/latest/features/structured_outputs/), checked 2026-10-03.

An illustrative continuously running GPU comparison: Runpod currently lists H100 SXM 80 GB at **$3.49/hour** and RTX 4090 24 GB at **$0.74/hour** for its displayed Pod offers. At 730 hours/month, that is about $2,548 or $540 in GPU rental alone. [Runpod pricing](https://www.runpod.io/pricing), undated page checked 2026-10-03. Matching those costs against the example hosted-session prices gives approximately **274,000 120B sessions/month** or **116,000 20B sessions/month**, before storage, redundancy, operations, or capacity constraints. This is arithmetic, not a throughput or profitability forecast. Scale-to-zero can reduce idle costs but adds startup latency. Prefer hosted inference initially; revisit self-hosting with measured sustained usage or a concrete data-locality requirement.

### Fish transcription: capability and price

Fish documents a **beta, synchronous, single-file ASR endpoint**: `POST https://api.fish.audio/v1/asr`. Authenticate with `Authorization: Bearer FISH_API_KEY`; select the model with the HTTP header `model: transcribe-1-pro`. Upload multipart field `audio`, not base64 JSON or bare PCM. The response includes `text` and uploaded `duration` in seconds. Missing or invalid model headers silently fall back to `transcribe-1`; verify the exact header. [Fish ASR endpoint](https://docs.fish.audio/api-reference/endpoint/openapi-v1/speech-to-text), undated, checked 2026-10-03.

For single-speaker task dictation, optional multipart fields `ignore_timestamps=true`, `tag_audio_events=false`, and `diarize=false` avoid unnecessary annotations. A lowercase ISO language hint is optional. `diarize=false` suppresses speaker-turn metadata but may leave inline `<|speaker:N|>` markers in text; remove only those documented markers before task interpretation. Let the multipart client set its boundary. [Fish transcription guide](https://docs.fish.audio/features/speech-to-text), undated, checked 2026-10-03.

The reviewed documentation index and OpenAPI list `/v1/asr` as a file request. The documented WebSocket is **text-to-speech**, not a transcription socket. No standalone streaming STT endpoint was found. To support live Ramble updates, detect utterance boundaries locally, upload bounded WAV clips, and await each completed transcript. This provides updates between utterances, without the interim word-by-word text of a live transcription socket. It also adds pause detection and upload latency. [Fish documentation index](https://docs.fish.audio/llms.txt), [Fish OpenAPI](https://docs.fish.audio/api-reference/openapi.json), [Fish TTS WebSocket](https://docs.fish.audio/api-reference/endpoint/websocket/tts-live), checked 2026-10-03. This is a limitation of the publicly documented API, not a claim about Fish's internal systems.

Both Fish `transcribe-1` and `transcribe-1-pro` cost **$0.36 per uploaded audio hour**, rounded up to the next second and including silence. Successful calls are billed; errors are not. Account-wide concurrent-request limits start at five and increase with prepaid balance; 429 responses have no `Retry-After`. [Fish pricing and rate limits](https://docs.fish.audio/developer-guide/models-pricing/pricing-and-rate-limits), undated, checked 2026-10-03.

ElevenLabs currently lists Scribe realtime at **$0.39/hour** and batch Scribe at **$0.22/hour**. Fish is about **7.7% cheaper than realtime**, and more expensive than that batch price. Ten uploaded audio minutes cost $0.060 with Fish versus $0.065 with ElevenLabs realtime: **half a cent saved**. Combining ten minutes with the illustrative Gemini session gives $0.089 versus $0.094, excluding all other costs. Repeated overlapping clips, silence, and per-clip rounding can erode savings. [ElevenLabs API pricing](https://elevenlabs.io/pricing/api), undated, checked 2026-10-03. The request count/token budget and ten-minute duration are separate illustrative assumptions.

### Fully local transcription and interpretation

For Apple Silicon, start by evaluating **whisper.cpp with multilingual `base` or `small`**, using Metal acceleration. Avoid `.en` variants when German or code-switching is required. Current whisper.cpp estimates memory at roughly 388 MB for base and 852 MB for small; actual simultaneous application/LLM memory needs are larger. Its microphone demo processes a rolling buffer every 500 ms, but that interval is **not a guaranteed transcript latency**. Both a local HTTP server and a streaming example are available. [whisper.cpp repository](https://github.com/ggml-org/whisper.cpp), [OpenAI Whisper models and languages](https://github.com/openai/whisper#available-models-and-languages), current repositories checked 2026-10-03.

The official server accepts `POST http://127.0.0.1:8080/inference`, multipart `file` containing WAV, with `response_format=json` and `temperature=0`. A server-side adapter can convert microphone PCM into **16 kHz mono PCM16 WAV**. [whisper.cpp server README](https://github.com/ggml-org/whisper.cpp/tree/master/examples/server), checked 2026-10-03. The current implementation also accepts multipart `language=auto` and `translate=false`; JSON contains a `text` field. Set language explicitly because the server's default is English. [whisper.cpp server implementation](https://github.com/ggml-org/whisper.cpp/blob/master/examples/server/server.cpp), checked 2026-10-03. Verify installed-version flags; the presence of a binary does not mean model weights are installed or its server is running.

**faster-whisper** is a useful Python/CTranslate2 alternative for CPU int8 or NVIDIA CUDA deployment, with integrated Silero VAD and separate real-time integrations. Its published large-v2 benchmark transcribes 13 minutes in 59 seconds with int8 on RTX 3070 Ti; batching improves throughput further. Those are offline throughput results, not pause-to-task latency on an Apple M4. They reference version 1.1.0 and older comparison runtimes, so validate the installed runtime rather than treating them as current hardware measurements. [SYSTRAN faster-whisper README](https://github.com/SYSTRAN/faster-whisper), checked 2026-10-03. The original Whisper-Streaming paper's 3.3-second long-form latency is from **2023**, over 12 months old; its own repository now recommends SimulStreaming. [Whisper-Streaming author repository](https://github.com/ufal/whisper_streaming), checked 2026-10-03.

For the local task interpreter, use **Ollama `qwen3.5:4b`** as the tested development starting point: its Q4_K_M download is **3.4 GB** with Apache 2.0 licensing. `qwen3.5:9b` is also available at **6.6 GB** if independent testing later justifies the added memory and latency. Those are weight sizes, not total runtime memory. [Ollama 4B tag](https://ollama.com/library/qwen3.5:4b), [9B tag](https://ollama.com/library/qwen3.5:9b), checked 2026-10-03. Qwen's model card advertises 201 languages/dialects and native 262,144-token capacity, but bounded Ramble context should be much smaller. Thinking is on by default; Qwen3.5 does **not** support Qwen3's `/think` or `/nothink` prompt switches. Disable thinking through the serving API. The official small-model benchmarks are proxies, not Ramble or Swiss German accuracy, and Ollama's family table describes a much larger model. [Qwen3.5-4B official card](https://huggingface.co/Qwen/Qwen3.5-4B), [9B card](https://huggingface.co/Qwen/Qwen3.5-9B), checked 2026-10-03.

The older **`qwen3:4b`** candidate (2.5 GB download) was rejected after actual task-extraction tests: **2/14 passed and 12 failed**. It omitted dates, failed to split multiple actions, created tasks from already completed activities, and invented parent IDs. Its roughly 1.5-second warm responses did not compensate for those semantic failures. Initial `qwen3.5:4b` testing before prompt refinement passed **5/14**; the later 18/18 result reflects model, prompt, date-context, and corpus changes rather than isolating a model upgrade's effect. These are local development observations reported by the implementation agent, not published model-wide results. [Original Ollama tag](https://ollama.com/library/qwen3:4b), checked 2026-10-03.

Ollama's local OpenAI-compatible endpoint is `http://127.0.0.1:11434/v1/chat/completions`, with `response_format` JSON Schema, `stream=false`, and the chosen model tag. Current compatibility docs map `reasoning_effort="none"` to disabled thinking for boolean-controlled models; check `/api/show` for supported values on the installed model/runtime. Native `/api/chat` instead uses `think=false` and `format=<schema>`. Do not assume native `think` is accepted on Chat Completions. [Ollama compatibility](https://docs.ollama.com/api/openai-compatibility), [thinking controls](https://docs.ollama.com/capabilities/thinking), [structured outputs](https://docs.ollama.com/capabilities/structured-outputs), checked 2026-10-03. Local structured output is supported; Ollama Cloud currently excludes it.

Local cold loading can dominate short requests. Preload the model, keep it resident where memory permits, distinguish warm/cold latency, and give local startup a configurable timeout rather than assuming a ten-second hosted timeout will work. Ollama documents empty requests for preloading and `keep_alive` for residency. [Ollama FAQ](https://docs.ollama.com/faq), checked 2026-10-03. Engineering recommendation: bounded utterance clips, one inference request at a time, bounded queues, silence filtering, and clear recovery preserve responsiveness. Energy thresholding detects speech boundaries, **not task intent**; the LLM still decides whether the transcript expresses a task or correction.

For development on this Mac, the application server can call loopback STT and LLM services. A remotely hosted application server's `127.0.0.1` points to the remote host, not the user's Mac. Supporting local user inference in production requires a desktop/local bridge with authenticated access or a separate browser-local runtime. WebAssembly exists for whisper.cpp, but it does not establish acceptable performance for this application. Do not silently send audio or task context to a hosted fallback when the user selected a fully local mode. This deployment recommendation is an engineering inference from the documented service interfaces.

### Implementation validation observed on 2026-10-03

The following measurements come from the implementation agent's actual development requests and integration checks. Hardware was identified as **Apple M5 Pro** in Whisper logs. They describe this configuration and corpus, not general provider/model performance.

| Check | Observed result | Practical limit |
| --- | --- | --- |
| Local `qwen3.5:4b`, refined prompt with date-only calendar context and examples | **18/18 synthetic cases passed**; request p50 **1,447 ms**, p95 **2,260 ms**; no concurrent inference during evaluation | Cases were used to develop the prompt; this is a development check, not an independent blind benchmark |
| Local synthetic speech through authenticated task flow | Transcription, staging, save, hierarchy, and undo passed; created QA artifacts were deleted | Synthetic speech does not verify real microphone audio, background noise, dialects, or natural interruptions |
| Transcription text | Small errors included “Ramble” → “Rambl” and “Buy” → “Bye” | Interpretation still needs robustness to recognition errors; names and commands may need clarification |
| Initial Gemini live requests | **14/18 checks passed**; all 14 successful responses passed accuracy checks, while four received **429** quota/rate errors and remained unmeasured for accuracy. Overall request p50 **832 ms**, p95 **1,230 ms** includes rate-limited calls | This initial latency summary is not a fair complete 18-case comparison; it motivated the paced rerun below |
| Completed paced Gemini rerun | **18/18 synthetic cases passed**, zero request errors; request p50 **956 ms**, p95 **1,299 ms**; **26,464 input tokens + 1,026 generated tokens including thoughts** | Requests were paced 15 seconds apart with no other Gemini inference; latency excludes intentional inter-request pacing. This demonstrates that workload at that cadence, not burst capacity or an independent holdout result |
| Fish live validation | API key created and saved after user approval, with 90-day expiration; initial zero-credit requests returned HTTP402. After the user completed funding, the refreshed account showed **$5 credit**, auto-recharge off; **two Fish + Gemini synthetic speech-to-task runs passed** | No agent-submitted purchase. Verified dates, hierarchy, undo, staging, save and scoped cleanup; no standalone ASR latency benchmark or general microphone accuracy claim |

The completed Gemini evaluation's estimated standard paid-price cost is **$0.010504** for all 18 cases: `(26,464 × $0.30 + 1,026 × $2.50) / 1,000,000`, rounded. The requests used a free project, so this is **not an actual charge**. Its API key was created and saved after user approval. The paid session arithmetic above remains illustrative; the report does not assign a dollar cost to local development requests. After funding and hosted integration checks, the preview now selects Fish and Gemini; local Whisper and Qwen remain explicitly selectable. The user's reopened browser tab verified automatic microphone startup and real local speech capture, followed by discard without saving. That establishes basic readiness, not hosted microphone accuracy or robustness. Fish speaker markers are removed before interpretation and audio-event tags are disabled; the final hosted rerun verified clean text. [Fish transcript metadata and options](https://docs.fish.audio/features/speech-to-text), checked 2026-10-03. Before claiming production accuracy, evaluate untouched cases for filler, completed activities, negation, corrections, multiple tasks, dates, hierarchy, and multilingual speech; measure warm and cold latency separately.

## Key sources

1. [Groq production model catalog](https://console.groq.com/docs/models) and [strict output guide](https://console.groq.com/docs/structured-outputs): undated, checked **2026-10-03**; authoritative model IDs, prices, serving capabilities, and provider speed claims.
2. [OpenAI-authored GPT-OSS model card](https://arxiv.org/html/2508.10925v1): **August 2025**, over 12 months old; primary comparable low-reasoning tool-use and multilingual results for the two open models.
3. [OpenAI Luna model specification](https://developers.openai.com/api/docs/models/gpt-6-luna) and [API changelog](https://developers.openai.com/api/docs/changelog): current docs checked **2026-10-03**, Luna release **2026-09-22**; current small-model pricing and capability baseline.
4. [Google model pricing](https://ai.google.dev/gemini-api/docs/pricing) and [release notes](https://ai.google.dev/gemini-api/docs/changelog): checked **2026-10-03**, relevant access update **2026-09-18**; avoids selecting restricted or superseded models from older research.
5. [Cerebras public model metadata](https://api.cerebras.ai/public/v1/models/gpt-oss-120b): live, unauthenticated metadata checked **2026-10-03**; current price/capabilities directly from the service rather than historical marketing.

## Currency assessment

**The most recent source I found is dated October 1, 2026**, in Ollama's thinking-page `dateModified` metadata; the latest explicit release-note date used is September 29 in the OpenAI changelog. Luna-specific release guidance is dated September 22. Undated live catalog/pricing/API metadata were checked **October 3, 2026**. Prices, catalog access, promotional periods, endpoint compatibility, and throughput can change quickly; verify before deployment and periodically after launch. Earlier articles suggesting Gemini 2.5 for new projects or public Groq Llama 8B pricing conflict with newer official catalogs; use the newer access/pricing statements.

## Caveats and limitations

No source establishes a universal winner for intelligence, latency, throughput, and cost simultaneously. Published benchmarks are proxies, and generation-rate claims are not application latency measurements. The observed synthetic development checks are not independent holdout scores. Strict JSON still allows a confidently wrong operation. Multilingual knowledge scores do not establish dialect recognition or semantic task extraction reliability. Actual usage, bounded context, reasoning tokens, concurrency, and provider/account quotas determine costs and responsiveness; independent acceptance tests and measured production telemetry must decide subsequent optimization. Fish's documented file API needs segmentation and cannot be assumed to provide interim transcripts. Local and hosted integrations passed with synthetic speech, and basic real local microphone startup/capture worked; broader microphone quality and untouched task cases remain to be tested. Google free-project quota interrupted the initial run; pacing completed the rerun but does not establish burst availability. Fish's initial funding block was resolved by the user; subsequent successful integration checks do not establish ASR latency under production load.
