import { afterEach, describe, expect, it, vi } from "vitest";
import { rambleSocketUrl } from "./ramble-audio";

afterEach(() => { vi.unstubAllEnvs(); });

describe("Ramble connection address", () => {
  it("defaults to the local API in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(rambleSocketUrl({ protocol: "http:", host: "localhost:3000", hostname: "localhost" })).toBe("ws://localhost:3001/api/ramble/ws");
  });

  it("uses secure same-origin routing in production even with a configured address", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(rambleSocketUrl({ protocol: "https:", host: "todalo.example", hostname: "todalo.example" }, "ws://localhost:3001/api/ramble/ws")).toBe("wss://todalo.example/api/ramble/ws");
  });

  it("permits a configured local development API and refuses remote endpoints", () => {
    vi.stubEnv("NODE_ENV", "development");
    const local = { protocol: "http:", host: "localhost:3000", hostname: "localhost" };
    expect(rambleSocketUrl(local, "ws://localhost:3001/api/ramble/ws")).toBe("ws://localhost:3001/api/ramble/ws");
    expect(() => rambleSocketUrl(local, "wss://other.example/api/ramble/ws")).toThrow("local WebSocket");
  });
});
