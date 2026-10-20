import { beforeEach, describe, expect, it } from "vitest";
import { KeyboardPreferencesError } from "@todalo/ramble/keyboard-account-preferences";
import { createSettingsRoutes } from "./settings-routes";

let rows: Map<string, boolean>;
beforeEach(() => { rows = new Map([["bob", false]]); });

const app = createSettingsRoutes({
  verify: async (headers) => headers.get("authorization")?.replace("Bearer ", "") ?? headers.get("cookie")?.replace("session=", "") ?? null,
  allowedOrigins: new Set(["http://localhost:5173"]),
  get: async (userId) => ({ smartDateRecognition: rows.get(userId) ?? true }),
  // Extra fields from the store never reach the response (allow-listed DTO).
  setSmartDateRecognition: async (userId, enabled) => { rows.set(userId, enabled); return { smartDateRecognition: enabled, userId } as never; },
  loadKeyboard: async () => { throw new Error("unused"); },
  saveKeyboard: async () => { throw new Error("unused"); },
});
const call = (method: string, init: { user?: string; cookie?: string; origin?: string; body?: unknown; raw?: string } = {}) => {
  const headers = new Headers();
  if (init.user) headers.set("authorization", `Bearer ${init.user}`);
  if (init.cookie) headers.set("cookie", `session=${init.cookie}`);
  if (init.origin) headers.set("origin", init.origin);
  if (init.body !== undefined || init.raw !== undefined) headers.set("content-type", "application/json");
  return app.handle(new Request("http://localhost/api/v1/settings", { method, headers, body: init.raw ?? (init.body === undefined ? undefined : JSON.stringify(init.body)) }));
};

describe("settings API", () => {
  it("reads only the session account's settings, defaulting smart dates on", async () => {
    const response = await call("GET", { user: "alice" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ settings: { smartDateRecognition: true } });
    expect(await (await call("GET", { user: "bob" })).json()).toEqual({ settings: { smartDateRecognition: false } });
  });

  it("saves the preference for the session user only, so it survives a reload", async () => {
    const response = await call("PATCH", { user: "alice", body: { smartDateRecognition: false } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ settings: { smartDateRecognition: false } });
    expect(await (await call("GET", { user: "alice" })).json()).toEqual({ settings: { smartDateRecognition: false } });
    expect(rows.get("bob")).toBe(false);
    await call("PATCH", { user: "bob", body: { smartDateRecognition: true } });
    expect(rows.get("alice")).toBe(false);
  });

  it("rejects bad bodies, including a user ID, without writing", async () => {
    for (const init of [{ body: {} }, { body: { smartDateRecognition: "no" } }, { body: { smartDateRecognition: true, userId: "bob" } }, { raw: "{" }]) {
      const response = await call("PATCH", { user: "alice", ...init });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ code: "INVALID_INPUT", message: "Check your entry and try again." });
    }
    expect(rows.has("alice")).toBe(false);
  });

  it("guards writes: 401 without a session, 403 for cookie writes from another origin, bearer ignores cookies", async () => {
    expect((await call("GET")).status).toBe(401);
    expect((await call("PATCH", { origin: "http://localhost:5173", body: { smartDateRecognition: false } })).status).toBe(401);
    const forged = await call("PATCH", { cookie: "alice", origin: "https://evil.example", body: { smartDateRecognition: false } });
    expect(forged.status).toBe(403);
    expect(await forged.json()).toEqual({ code: "FORBIDDEN_ORIGIN", message: "This request was not sent by todalo." });
    expect((await call("PATCH", { cookie: "alice", body: { smartDateRecognition: false } })).status).toBe(403);
    expect(rows.has("alice")).toBe(false);
    expect((await call("PATCH", { cookie: "alice", origin: "http://localhost:5173", body: { smartDateRecognition: false } })).status).toBe(200);
    await call("PATCH", { user: "bob", cookie: "alice", origin: "https://evil.example", body: { smartDateRecognition: true } });
    expect(rows.get("bob")).toBe(true);
    expect(rows.get("alice")).toBe(false);
  });
});

describe("keyboard shortcuts API", () => {
  let saved: Map<string, unknown>;
  beforeEach(() => { saved = new Map(); });
  const shortcuts = createSettingsRoutes({
    verify: async (headers) => headers.get("authorization")?.replace("Bearer ", "") ?? headers.get("cookie")?.replace("session=", "") ?? null,
    allowedOrigins: new Set(["http://localhost:5173"]),
    get: async () => ({ smartDateRecognition: true }),
    setSmartDateRecognition: async () => ({ smartDateRecognition: true }),
    loadKeyboard: async (userId) => ({ preferences: (saved.get(userId) ?? { version: 1, registryVersion: 1, overrides: {}, platforms: {} }) as never }),
    saveKeyboard: async (userId, input) => {
      const preferences = (input as { overrides?: Record<string, string[]> }).overrides?.["general.help"]?.[0] === "Meta+h"
        ? (() => { throw new KeyboardPreferencesError("mac: This combination is reserved by macOS."); })() : input;
      saved.set(userId, preferences);
      return preferences as never;
    },
  });
  const send = (method: string, init: { user?: string; cookie?: string; origin?: string; body?: unknown } = {}) => {
    const headers = new Headers();
    if (init.user) headers.set("authorization", `Bearer ${init.user}`);
    if (init.cookie) headers.set("cookie", `session=${init.cookie}`);
    if (init.origin) headers.set("origin", init.origin);
    if (init.body !== undefined) headers.set("content-type", "application/json");
    return shortcuts.handle(new Request("http://localhost/api/v1/settings/keyboard", { method, headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) }));
  };
  const custom = { version: 1, registryVersion: 1, overrides: { "general.help": ["Alt+Shift+2"] }, platforms: {} };

  it("reads and saves only the session account's shortcuts", async () => {
    const response = await send("GET", { user: "alice" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ preferences: { version: 1, registryVersion: 1, overrides: {}, platforms: {} } });
    expect((await send("PUT", { user: "alice", body: { preferences: custom } })).status).toBe(200);
    expect(await (await send("GET", { user: "alice" })).json()).toEqual({ preferences: custom });
    expect(saved.has("bob")).toBe(false);
  });

  it("answers 400 with the validation message for reserved or conflicting shortcuts, and for bad bodies", async () => {
    const response = await send("PUT", { user: "alice", body: { preferences: { ...custom, overrides: { "general.help": ["Meta+h"] } } } });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ code: "INVALID_INPUT", message: "mac: This combination is reserved by macOS." });
    expect((await send("PUT", { user: "alice", body: custom })).status).toBe(400);
    expect(saved.has("alice")).toBe(false);
  });

  it("guards writes like other settings", async () => {
    expect((await send("GET")).status).toBe(401);
    expect((await send("PUT", { cookie: "alice", origin: "https://evil.example", body: { preferences: custom } })).status).toBe(403);
    expect((await send("PUT", { cookie: "alice", origin: "http://localhost:5173", body: { preferences: custom } })).status).toBe(200);
  });
});
