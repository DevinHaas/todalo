// Explicit opt-in: downloads public model weights, starts loopback-only services.
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../../..");
const directory = resolve(root, ".local-models");
const model = resolve(directory, "ggml-base.bin");
const whisper = Bun.which("whisper-server"); const ollama = Bun.which("ollama");
if (!whisper || !ollama) throw new Error("Install whisper-cpp and ollama first (macOS: brew install whisper-cpp ollama)");
await mkdir(directory, { recursive: true });
if (!await Bun.file(model).exists() || Bun.file(model).size !== 147951465) {
  console.log("Downloading multilingual Whisper base (~148MB)");
  const response = await fetch("https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin", { signal: AbortSignal.timeout(180_000) });
  if (!response.ok || !response.body) throw new Error("Whisper model download failed");
  const writer = Bun.file(model).writer(); const reader = response.body.getReader(); let received = 0; let progress = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      writer.write(value); received += value.length;
      if (received - progress >= 20_000_000) { progress = received; await writer.flush(); console.log(`Whisper downloaded ${Math.round(received / 1_000_000)}MB`); }
    }
    await writer.end();
  } catch (error) { await writer.end(); throw error; }
  if (received !== 147951465) throw new Error("Incomplete Whisper download; rerun setup");
}
const children: ReturnType<typeof Bun.spawn>[] = [];
async function available(url: string) { try { return (await fetch(url, { signal: AbortSignal.timeout(1000) })).ok; } catch { return false; } }
if (!await available("http://127.0.0.1:11434/api/tags")) {
  children.push(Bun.spawn([ollama, "serve"], { env: { ...process.env, OLLAMA_HOST: "127.0.0.1:11434", OLLAMA_MODELS: resolve(directory, "ollama") }, stdout: "inherit", stderr: "inherit" }));
  for (let i = 0; i < 20 && !await available("http://127.0.0.1:11434/api/tags"); i++) await Bun.sleep(500);
}
console.log("Preparing Qwen3.5 4B (~3.4GB download); initial load may take a minute");
const pull = Bun.spawn([ollama, "pull", "qwen3.5:4b"], { env: { ...process.env, OLLAMA_HOST: "127.0.0.1:11434" }, stdout: "inherit", stderr: "inherit" });
if (await pull.exited !== 0) throw new Error("Local task model download failed");
if (!await available("http://127.0.0.1:8080/")) {
  children.push(Bun.spawn([whisper, "--host", "127.0.0.1", "--port", "8080", "-m", model, "-l", "auto", "--suppress-nst"], { cwd: root, stdout: "inherit", stderr: "inherit" }));
}
console.log("Local services running. Start bun run --filter @todalo/api dev:local and bun run dev:web in separate terminals.");
function stop() { for (const child of children) child.kill(); process.exit(); }
process.on("SIGINT", stop); process.on("SIGTERM", stop);
await new Promise(() => {});
