import { describe, expect, it } from "vitest";
import { defaultPreferences, effectiveBindings, validatePreferences, KeyboardDispatcher, bindingFromEvent, parsePreferences, safePreferences, snapshotPreferences } from "./keyboard";
import { keyboardAccountPreferences } from "./keyboard-account-preferences";

describe("account keyboard preferences", () => {
  it("uses verified calendar and Upcoming platform defaults and dispatches a saved layout override", () => {
    const preferences = defaultPreferences();
    expect(effectiveBindings("upcoming.today", preferences, "mac")).toEqual(["Alt+Shift+y"]);
    expect(effectiveBindings("upcoming.today", preferences, "windows")).toEqual(["Home"]);
    expect(effectiveBindings("calendar.today", preferences, "mac")).toEqual(["t", "Alt+Shift+y"]);
    expect(effectiveBindings("calendar.today", preferences, "windows")).toEqual(["t"]);
    const custom = { ...preferences, overrides: { "view.layout": ["Alt+v"] } };
    const dispatcher = new KeyboardDispatcher();
    const commands = [{ id: "view.layout", bindings: effectiveBindings("view.layout", custom, "mac") }];
    expect(dispatcher.dispatch({ key: "v", metaKey: false, ctrlKey: false, altKey: true, shiftKey: false, repeat: false }, commands, "project").commandId).toBe("view.layout");
    expect(dispatcher.dispatch({ key: "V", metaKey: false, ctrlKey: false, altKey: false, shiftKey: true, repeat: false }, commands, "project").consumed).toBe(false);
  });
  it("keeps disabled commands disabled and adapts portable modifiers", () => {
    const preferences = { ...defaultPreferences(), overrides: { "general.capture": [], "navigation.today": ["Primary+e"] } };
    expect(effectiveBindings("general.capture", preferences, "mac")).toEqual([]);
    expect(effectiveBindings("navigation.today", preferences, "mac")).toEqual(["Meta+e"]);
    expect(effectiveBindings("navigation.today", preferences, "windows")).toEqual(["Ctrl+e"]);
  });
  it("rejects ambiguous prefixes and system reservations before saving", () => {
    const errors = validatePreferences({ ...defaultPreferences(), overrides: { "general.capture": ["g"], "general.help": ["Primary+q"] } });
    expect(errors.some(error => error.commandId === "general.capture" && error.otherId === "navigation.today")).toBe(true);
    expect(errors.some(error => error.commandId === "general.help" && /reserved/i.test(error.message))).toBe(true);
  });
  it("accepts the documented baseline and rejects malformed persisted preferences", () => {
    expect(validatePreferences(defaultPreferences())).toEqual([]);
    expect(() => parsePreferences({ version: 9 })).toThrow(/version/);
  });
  it("loads and saves legacy Home assignments without losing other account shortcuts", async () => {
    const legacy = {
      ...defaultPreferences(),
      overrides: { "navigation.home": ["h"], "general.capture": [] },
      platforms: Object.fromEntries(["mac", "windows", "linux"].map(platform => [platform, { "navigation.home": ["Alt+Shift+9"], "general.search": ["Alt+Shift+8"] }])),
      lastEffective: { mac: { "navigation.home": ["h"], "general.capture": [] } },
    };
    let stored: unknown = legacy;
    const api = keyboardAccountPreferences(async () => "alice", { read: async () => stored, write: async (_id, value) => { stored = value; } });
    const loaded = await api.load();
    expect(loaded.error).toBeUndefined();
    expect(validatePreferences(loaded.preferences)).toEqual([]);
    expect(loaded.preferences.overrides).toEqual({ "general.capture": [] });
    expect(loaded.preferences.lastEffective?.mac).toEqual({ "general.capture": [] });
    const saved = await api.save(legacy);
    for (const platform of ["mac", "windows", "linux"] as const) {
      expect(saved.platforms[platform]).toEqual({ "general.search": ["Alt+Shift+8"] });
      expect(saved.lastEffective?.[platform]).not.toHaveProperty("navigation.home");
      expect(effectiveBindings("general.capture", saved, platform)).toEqual([]);
      expect(effectiveBindings("general.search", saved, platform)).toEqual(["Alt+Shift+8"]);
      expect(effectiveBindings("navigation.home", saved, platform)).toEqual([]);
    }
  });
  it("still rejects other unknown saved shortcut actions", () => {
    const preferences = parsePreferences({ ...defaultPreferences(), overrides: { "navigation.unknown": ["Alt+Shift+9"] } });
    expect(validatePreferences(preferences).some(error => error.commandId === "navigation.unknown" && /Unknown action/.test(error.message))).toBe(true);
  });
  it("retains a previous effective configuration when new defaults conflict", () => {
    const registry = [{ id: "capture", label: "Capture", group: "General", context: "global" as const, availability: "available" as const, defaults: ["q"] }];
    const saved = snapshotPreferences(defaultPreferences(), registry);
    const updatedRegistry = [...registry, { ...registry[0]!, id: "new", defaults: ["q"] }];
    const result = safePreferences(saved, "mac", updatedRegistry);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(effectiveBindings("capture", result.preferences, "mac", updatedRegistry)).toEqual(["q"]);
    expect(effectiveBindings("new", result.preferences, "mac", updatedRegistry)).toEqual([]);
  });
  it("isolates account persistence and leaves saved settings untouched on invalid writes", async () => {
    const rows = new Map<string, unknown>();
    let account: string | null = "alice";
    const api = keyboardAccountPreferences(async () => { if (!account) throw new Error("Unauthorized"); return account; }, { read: async id => rows.get(id), write: async (id, value) => { rows.set(id, value); } });
    await api.save({ ...defaultPreferences(), overrides: { "general.capture": [] } });
    account = "bob";
    expect((await api.load()).preferences.overrides).toEqual({});
    await expect(api.save({ ...defaultPreferences(), overrides: { "general.help": ["q"] } })).rejects.toThrow(/Conflicts/);
    account = "alice";
    expect((await api.load()).preferences.overrides["general.capture"]).toEqual([]);
    account = null;
    await expect(api.load()).rejects.toThrow("Unauthorized");
  });
});

describe("browser dispatch", () => {
  it("dispatches Quick Add description and additional actions while editing the task name", () => {
    const dispatcher = new KeyboardDispatcher();
    const commands = ["quick-add.description", "quick-add.actions", "quick-add.deadline"].map(id => ({ id, bindings: effectiveBindings(id, defaultPreferences(), "mac"), allowInEditor: true, allowInModal: true }));
    const event = { key: "ArrowDown", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, repeat: false };
    expect(dispatcher.dispatch(event, commands, "quick-add", 0, { typing: true, modal: true }).commandId).toBe("quick-add.description");
    expect(dispatcher.dispatch({ ...event, shiftKey: true }, commands, "quick-add", 1, { typing: true, modal: true }).commandId).toBe("quick-add.actions");
  });
  it("falls through declined task actions to calendar actions and consumes only handled commands", () => {
    const dispatcher = new KeyboardDispatcher();
    const event = { key: "t", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, repeat: false };
    const commands = [
      { id: "task-date", bindings: ["t"], handle: () => false },
      { id: "calendar-today", bindings: ["t"], handle: () => true },
    ];
    expect(dispatcher.dispatch(event, commands, "calendar").commandId).toBe("calendar-today");
    expect(dispatcher.dispatch(event, commands.map(command => ({ ...command, handle: () => false })), "calendar").consumed).toBe(false);
    expect(dispatcher.dispatch(event, commands.map(command => ({ ...command, handle: () => true })), "task").commandId).toBe("task-date");
  });
  it("pauses app commands while typing, composing or in a modal and allows only explicit editor commands", () => {
    const dispatcher = new KeyboardDispatcher();
    const event = { key: "q", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, repeat: false };
    const capture = [{ id: "capture", bindings: ["q"] }];
    expect(dispatcher.dispatch(event, capture, "view", 0, { typing: true }).consumed).toBe(false);
    expect(dispatcher.dispatch(event, capture, "view", 0, { composing: true }).consumed).toBe(false);
    expect(dispatcher.dispatch(event, capture, "view", 0, { modal: true }).consumed).toBe(false);
    expect(dispatcher.dispatch({ ...event, key: "Enter", metaKey: true }, [{ id: "save", bindings: ["Meta+Enter"], allowInEditor: true, allowInModal: true }], "editor", 0, { typing: true, modal: true }).commandId).toBe("save");
  });
  it("uses character symbols on non-US layouts and keeps Command distinct from Control", () => {
    expect(bindingFromEvent({ key: "?", shiftKey: true, ctrlKey: false, metaKey: false, altKey: false, repeat: false })).toBe("?");
    expect(bindingFromEvent({ key: "]", shiftKey: false, ctrlKey: true, metaKey: false, altKey: false, repeat: false })).toBe("Ctrl+]");
  });
  it("ignores repeated destructive keys but allows navigation repeats", () => {
    const dispatcher = new KeyboardDispatcher();
    const event = { key: "e", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, repeat: true };
    expect(dispatcher.dispatch(event, [{ id: "complete", bindings: ["e"] }], "task").consumed).toBe(false);
    expect(dispatcher.dispatch({ ...event, key: "j" }, [{ id: "next", bindings: ["j"], repeat: true }], "task").commandId).toBe("next");
  });
  it("matches produced characters and resets sequences after a second or changed context", () => {
    const dispatcher = new KeyboardDispatcher();
    const commands = [{ id: "today", bindings: ["g then t"], repeat: false }];
    const event = (key: string) => ({ key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, repeat: false });
    expect(dispatcher.dispatch(event("g"), commands, "today", 0)).toEqual({ consumed: true });
    expect(dispatcher.dispatch(event("t"), commands, "today", 900)).toEqual({ consumed: true, commandId: "today" });
    dispatcher.dispatch(event("g"), commands, "today", 1000);
    expect(dispatcher.dispatch(event("t"), commands, "today", 2001).consumed).toBe(false);
    dispatcher.dispatch(event("g"), commands, "today", 3000);
    expect(dispatcher.dispatch(event("t"), commands, "other", 3001).consumed).toBe(false);
  });
});
