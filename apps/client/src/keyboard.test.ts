import { describe, expect, it, vi } from "vitest";
import { defaultPreferences, effectiveBindings, KeyboardDispatcher, validatePreferences } from "@todalo/ramble/keyboard";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ShortcutHelp, ShortcutSettings } from "./keyboard-views";
import { adjacentRow, browserKeyboardTransport, clientCommands, detectPlatform, dispatchCommands, isEditable } from "./keyboard";

const key = (key: string, extra: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; repeat: boolean }> = {}) =>
  ({ key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, repeat: false, ...extra });

describe("client keyboard commands", () => {
  const handlers = { "general.capture": vi.fn(), "navigation.today": vi.fn(), "task.next": vi.fn(() => false), "general.quick-find": vi.fn() };
  const commands = (preferences = defaultPreferences()) => dispatchCommands(handlers, id => effectiveBindings(id, preferences, "mac"));

  it("matches saved bindings, sequences and the Mac Command profile", () => {
    const dispatcher = new KeyboardDispatcher();
    expect(dispatcher.dispatch(key("q"), commands(), "today").commandId).toBe("general.capture");
    expect(dispatcher.dispatch(key("g"), commands(), "today", 0)).toEqual({ consumed: true });
    expect(dispatcher.dispatch(key("t"), commands(), "today", 500).commandId).toBe("navigation.today");
    expect(dispatcher.dispatch(key("k", { metaKey: true }), commands(), "today").commandId).toBe("general.quick-find");
    const custom = { ...defaultPreferences(), overrides: { "general.capture": ["Alt+Shift+x"] } };
    expect(dispatcher.dispatch(key("q"), commands(custom), "today").consumed).toBe(false);
    expect(dispatcher.dispatch(key("X", { altKey: true, shiftKey: true }), commands(custom), "today").commandId).toBe("general.capture");
  });

  it("leaves a key unconsumed when its handler declines (no list to move through)", () => {
    expect(new KeyboardDispatcher().dispatch(key("j"), commands(), "today").consumed).toBe(false);
  });

  it("runs composer and editor commands while typing in a dialog, and passes the key on when they decline", () => {
    const save = vi.fn(); const submit = vi.fn(() => false); const details = vi.fn();
    const editing = dispatchCommands({ "editor.save-below": save, "editor.submit-below": submit, "task.details": details, "general.capture": vi.fn() }, id => effectiveBindings(id, defaultPreferences(), "mac"));
    const dispatcher = new KeyboardDispatcher();
    expect(dispatcher.dispatch(key("Enter", { shiftKey: true }), editing, "task", 0, { typing: true, modal: true }).commandId).toBe("editor.save-below");
    // Enter outside a composer title declines, so the focused row's Enter (details) still runs…
    expect(dispatcher.dispatch(key("Enter"), editing, "today", 0).commandId).toBe("task.details");
    // …and inside any other field it stays the field's own Enter.
    expect(dispatcher.dispatch(key("Enter"), editing, "today", 0, { typing: true }).consumed).toBe(false);
    expect(dispatcher.dispatch(key("q"), editing, "today", 0, { typing: true }).consumed).toBe(false);
    expect(details).toHaveBeenCalledTimes(1);
  });

  it("never fires in editable fields or behind an open dialog", () => {
    const dispatcher = new KeyboardDispatcher();
    expect(dispatcher.dispatch(key("q"), commands(), "today", 0, { typing: true }).consumed).toBe(false);
    expect(dispatcher.dispatch(key("q"), commands(), "today", 0, { modal: true }).consumed).toBe(false);
    expect(dispatcher.dispatch(key("q"), commands(), "today", 0, { composing: true }).consumed).toBe(false);
    // A target matches the editable selector through itself or an ancestor (closest).
    const element = (...ancestors: string[]) => ({ closest: (selector: string) => selector.split(",").some(part => ancestors.includes(part)) ? {} : null });
    expect(isEditable(element("input") as never)).toBe(true);
    expect(isEditable(element("span", '[contenteditable="true"]') as never)).toBe(true);
    expect(isEditable(element("textarea") as never)).toBe(true);
    expect(isEditable(element("button") as never)).toBe(false);
    expect(isEditable(null)).toBe(false);
  });

  it("lists only wired commands, all customizable and conflict-free by default on every platform", () => {
    expect(clientCommands.length).toBeGreaterThan(20);
    expect(clientCommands.every(command => command.availability === "available")).toBe(true);
    expect(validatePreferences(defaultPreferences())).toEqual([]);
  });

  it("moves through rows and jumps to either end", () => {
    expect(adjacentRow(["a", "b", "c"], null, 1)).toBe("a");
    expect(adjacentRow(["a", "b", "c"], null, -1)).toBe("c");
    expect(adjacentRow(["a", "b", "c"], "b", 1)).toBe("c");
    expect(adjacentRow(["a", "b", "c"], "c", 1)).toBe("c");
    expect(adjacentRow(["a", "b", "c"], "c", -Infinity)).toBe("a");
    expect(adjacentRow(["a", "b", "c"], "a", Infinity)).toBe("c");
    expect(adjacentRow([], "a", 1)).toBeNull();
  });

  it("uses the Command profile on Apple devices", () => {
    expect(detectPlatform("MacIntel")).toBe("mac");
    expect(detectPlatform("iPhone")).toBe("mac");
    expect(detectPlatform("Linux x86_64")).toBe("linux");
    expect(detectPlatform("Win32")).toBe("windows");
  });
});

describe("keyboard preference transport", () => {
  const custom = { ...defaultPreferences(), overrides: { "general.help": ["Alt+Shift+2"] } };
  it("reads and replaces the account document", async () => {
    const fetcher = vi.fn(async (_path: string, init?: RequestInit) => Response.json(init?.method === "PUT" ? { preferences: JSON.parse(String(init.body)).preferences } : { preferences: null, error: "Unsupported shortcut preference version." }));
    const transport = browserKeyboardTransport(fetcher as unknown as typeof fetch);
    expect(await transport.get()).toEqual({ preferences: defaultPreferences(), error: "Unsupported shortcut preference version." });
    expect(await transport.save(custom)).toMatchObject({ overrides: custom.overrides });
    expect(fetcher).toHaveBeenLastCalledWith("/api/v1/settings/keyboard", expect.objectContaining({ method: "PUT", body: JSON.stringify({ preferences: custom }) }));
  });

  it("maps rejections and malformed responses to safe errors", async () => {
    const answer = (response: Response) => browserKeyboardTransport((async () => response) as unknown as typeof fetch);
    await expect(answer(new Response(null, { status: 400 })).save(custom)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(answer(new Response(null, { status: 401 })).get()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(answer(new Response(null, { status: 500 })).get()).rejects.toMatchObject({ code: "SETTINGS_UNAVAILABLE" });
    await expect(answer(Response.json({ preferences: { version: 1 } })).get()).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
});

describe("shortcut views", () => {
  it("speaks each binding and lists only wired commands in help", () => {
    const html = renderToStaticMarkup(createElement(ShortcutHelp, { bindings: (id: string) => effectiveBindings(id, defaultPreferences(), "mac"), onCustomize: () => {}, onClose: () => {} }));
    expect(html).toContain('aria-label="Close keyboard shortcuts"');
    expect(html).toContain('aria-label="Command plus k"');
    expect(html).toContain('aria-label="g then t"');
    expect(html).toContain("Capture task");
    expect(html).not.toContain("Sort by priority");
  });

  it("shows a reserved Mac key as an error with a fix, and labels every touch control", () => {
    const preferences = { ...defaultPreferences(), platforms: { mac: { "general.help": ["Meta+h"] } } };
    const html = renderToStaticMarkup(createElement(ShortcutSettings, { preferences, platform: "mac", syncError: null, onRetry: () => {}, onSave: async () => {}, onHelp: () => {} }));
    expect(html).toContain("mac: This combination is reserved by macOS.");
    expect(html).toContain("Use available alternative");
    expect(html).toContain('aria-label="Change Command plus h for Show keyboard shortcuts"');
    expect(html).toContain('aria-label="Restore defaults for Show keyboard shortcuts"');
    expect(html).toContain('aria-label="Add shortcut for Capture task"');
  });
});
