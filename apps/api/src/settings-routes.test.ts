import { beforeEach, describe, expect, it } from "vitest";
import { KeyboardPreferencesError } from "@todalo/ramble/keyboard-account-preferences";
import { createSettingsRoutes } from "./settings-routes";
import { defaultPersonalization, personalizationInput, type PersonalizationDto } from "../../../packages/server/src/personalization-dto";

let rows: Map<string, boolean>;
let titles: Map<string, boolean>;
beforeEach(() => { rows = new Map([["bob", false]]); titles = new Map(); });

const app = createSettingsRoutes({
  verify: async (headers) => headers.get("authorization")?.replace("Bearer ", "") ?? headers.get("cookie")?.replace("session=", "") ?? null,
  allowedOrigins: new Set(["http://localhost:5173"]),
  get: async (userId) => ({ smartDateRecognition: rows.get(userId) ?? true, shareEventTitles: titles.get(userId) ?? false }),
  // Extra fields from the store never reach the response (allow-listed DTO).
  update: async (userId, input) => {
    if (input.smartDateRecognition !== undefined) rows.set(userId, input.smartDateRecognition);
    if (input.shareEventTitles !== undefined) titles.set(userId, input.shareEventTitles);
    return { smartDateRecognition: rows.get(userId) ?? true, shareEventTitles: titles.get(userId) ?? false, userId } as never;
  },
  loadKeyboard: async () => { throw new Error("unused"); },
  saveKeyboard: async () => { throw new Error("unused"); },
  loadPersonalization: async () => { throw new Error("unused"); },
  savePersonalization: async () => { throw new Error("unused"); },
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
    expect(await response.json()).toEqual({ settings: { smartDateRecognition: true, shareEventTitles: false } });
    expect(await (await call("GET", { user: "bob" })).json()).toEqual({ settings: { smartDateRecognition: false, shareEventTitles: false } });
  });

  it("saves the preference for the session user only, so it survives a reload", async () => {
    const response = await call("PATCH", { user: "alice", body: { smartDateRecognition: false } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ settings: { smartDateRecognition: false, shareEventTitles: false } });
    expect(await (await call("GET", { user: "alice" })).json()).toEqual({ settings: { smartDateRecognition: false, shareEventTitles: false } });
    expect(rows.get("bob")).toBe(false);
    await call("PATCH", { user: "bob", body: { smartDateRecognition: true } });
    expect(rows.get("alice")).toBe(false);
  });

  it("ticket 28: saves Share event titles alone, leaving smart dates as they were", async () => {
    const response = await call("PATCH", { user: "bob", body: { shareEventTitles: true } });
    expect(await response.json()).toEqual({ settings: { smartDateRecognition: false, shareEventTitles: true } });
    expect(titles.get("bob")).toBe(true);
    expect(titles.has("alice")).toBe(false);
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
    get: async () => ({ smartDateRecognition: true, shareEventTitles: false }),
    update: async () => ({ smartDateRecognition: true, shareEventTitles: false }),
    loadKeyboard: async (userId) => ({ preferences: (saved.get(userId) ?? { version: 1, registryVersion: 1, overrides: {}, platforms: {} }) as never }),
    saveKeyboard: async (userId, input) => {
      const preferences = (input as { overrides?: Record<string, string[]> }).overrides?.["general.help"]?.[0] === "Meta+h"
        ? (() => { throw new KeyboardPreferencesError("mac: This combination is reserved by macOS."); })() : input;
      saved.set(userId, preferences);
      return preferences as never;
    },
    loadPersonalization: async () => null,
    savePersonalization: async () => null,
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

describe("personalization (Settings › Appearance and Sidebar)", () => {
  const saved = new Map<string, PersonalizationDto>();
  const app = createSettingsRoutes({
    verify: async (headers) => headers.get("authorization")?.replace("Bearer ", "") ?? null,
    allowedOrigins: new Set(["http://localhost:5173"]),
    get: async () => { throw new Error("unused"); }, update: async () => { throw new Error("unused"); },
    loadKeyboard: async () => { throw new Error("unused"); }, saveKeyboard: async () => { throw new Error("unused"); },
    loadPersonalization: async (userId) => saved.get(userId) ?? null,
    savePersonalization: async (userId, input) => { const parsed = personalizationInput.safeParse(input); if (!parsed.success) return null; saved.set(userId, parsed.data); return parsed.data; },
  });
  const call = (method: string, user?: string, body?: unknown) => app.handle(new Request("http://localhost/api/v1/settings/personalization", {
    method, headers: { ...(user ? { authorization: `Bearer ${user}` } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body),
  }));
  const design = { ...defaultPersonalization, design: { mode: "dark", colors: ["#A8C3A0", "#7b9acc"], intensity: 60, grain: 30, accent: "#4a6fa5" },
    sidebar: { order: ["season", "goals", "today", "projects"], hidden: ["reporting", "more"] } };

  it("is null until saved, then returns the account's own document (colours normalised)", async () => {
    expect(await (await call("GET", "ann")).json()).toEqual({ personalization: null });
    expect((await call("PUT", "ann", { personalization: design })).status).toBe(200);
    const body = await (await call("GET", "ann")).json() as { personalization: PersonalizationDto };
    expect(body.personalization.design.colors).toEqual(["#a8c3a0", "#7b9acc"]);
    expect(body.personalization.sidebar.hidden).toEqual(["reporting", "more"]);
    expect(await (await call("GET", "bob")).json()).toEqual({ personalization: null });
  });

  it("refuses invalid documents and requests without a session", async () => {
    const bad = (patch: object) => call("PUT", "ann", { personalization: { ...design, ...patch } });
    expect((await bad({ design: { ...design.design, colors: [] } })).status).toBe(400);
    expect((await bad({ design: { ...design.design, grain: 101 } })).status).toBe(400);
    expect((await bad({ design: { ...design.design, colors: ["red"] } })).status).toBe(400);
    expect((await bad({ sidebar: { order: ["today", "today"], hidden: [] } })).status).toBe(400);
    expect((await bad({ sidebar: { order: ["shop"], hidden: [] } })).status).toBe(400);
    expect((await bad({ extra: true })).status).toBe(400);
    expect((await call("PUT", undefined, { personalization: design })).status).toBe(403); // no session: refused before any write
  });
});
