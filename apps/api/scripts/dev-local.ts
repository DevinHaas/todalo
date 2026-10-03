// Load the regular root .env for auth/database, then select both local providers.
process.env.RAMBLE_STT_PROVIDER = "local";
process.env.RAMBLE_STT_URL = "http://127.0.0.1:8080/inference";
process.env.RAMBLE_LLM_PROVIDER = "ollama";
process.env.RAMBLE_LLM_BASE_URL = "http://127.0.0.1:11434";
process.env.RAMBLE_LLM_MODEL = "qwen3.5:4b";
await import("../src/index");
export {};
