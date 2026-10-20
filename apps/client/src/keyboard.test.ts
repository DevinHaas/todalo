import { describe, expect, it, vi } from "vitest";
import { defaultPreferences, effectiveBindings, KeyboardDispatcher, validatePreferences } from "@todalo/ramble/keyboard";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { ShortcutHelp, ShortcutSettings, TaskMenu } from "./keyboard-views";
import { collapsedTasks, TaskRow } from "./views";
import { focusDialog } from "./organization-views";
import type { TaskDto } from "./tasks";
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

  it("maps the row, project, layout and week keys, shared keys falling through when a handler declines", () => {
    const declines = (...ids: string[]) => Object.fromEntries(ids.map(id => [id, vi.fn(() => false)]));
    const accepts = (...ids: string[]) => Object.fromEntries(ids.map(id => [id, vi.fn()]));
    const run = (handlers: Record<string, () => void | boolean>, input: ReturnType<typeof key>, environment = {}) =>
      new KeyboardDispatcher().dispatch(input, dispatchCommands(handlers, id => effectiveBindings(id, defaultPreferences(), "mac")), "view", 0, environment).commandId;
    const all = accepts("task.date", "task.clear-date", "task.priority-1", "task.priority-4", "task.priority", "task.labels", "task.deadline", "task.clear-deadline",
      "task.move", "task.nest", "task.unnest", "project.sort-name", "project.sort-priority", "project.section", "project.menu", "view.layout", "upcoming.today", "upcoming.next-week", "upcoming.previous-week");
    expect(run(all, key("t"))).toBe("task.date");
    expect(run(all, key("T", { shiftKey: true }))).toBe("task.clear-date");
    expect(run(all, key("1"))).toBe("task.priority-1");
    expect(run(all, key("4"))).toBe("task.priority-4");
    expect(run(all, key("y"))).toBe("task.priority");
    expect(run(all, key("l"))).toBe("task.labels");
    expect(run(all, key("D", { shiftKey: true }))).toBe("task.clear-deadline");
    expect(run(all, key("v"))).toBe("task.move");
    expect(run(all, key("]", { ctrlKey: true }))).toBe("task.nest");
    expect(run(all, key("[", { ctrlKey: true }))).toBe("task.unnest");
    expect(run(all, key("n"))).toBe("project.sort-name");
    expect(run(all, key("p"))).toBe("project.sort-priority");
    expect(run(all, key("s"))).toBe("project.section");
    expect(run(all, key("w"))).toBe("project.menu");
    expect(run(all, key("V", { shiftKey: true }))).toBe("view.layout");
    expect(run(all, key("Y", { altKey: true, shiftKey: true }))).toBe("upcoming.today");
    expect(run(all, key("ArrowRight", { shiftKey: true }))).toBe("upcoming.next-week");
    expect(run(all, key("ArrowLeft", { shiftKey: true }))).toBe("upcoming.previous-week");
    // d sorts the project by date unless a task row has focus (its deadline wins).
    expect(run({ ...accepts("project.sort-date", "task.deadline") }, key("d"))).toBe("project.sort-date");
    expect(run({ ...declines("project.sort-date"), ...accepts("task.deadline") }, key("d"))).toBe("task.deadline");
    // t without a focused row is the calendar's Today; week keys reach the calendar when Upcoming's list is not shown.
    expect(run({ ...declines("task.date"), ...accepts("calendar.today") }, key("t"))).toBe("calendar.today");
    expect(run({ ...declines("upcoming.next-week"), ...accepts("calendar.next-week") }, key("ArrowRight", { shiftKey: true }))).toBe("calendar.next-week");
    expect(run({ ...declines("upcoming.previous-week"), ...accepts("calendar.previous-week") }, key("ArrowLeft", { shiftKey: true }))).toBe("calendar.previous-week");
    // Command+arrows: previous/next task inside the editor, first/last row elsewhere.
    const arrows = { ...accepts("editor.previous", "editor.next", "view.first", "view.last") };
    expect(run(arrows, key("ArrowUp", { metaKey: true }), { typing: true, modal: true })).toBe("editor.previous");
    expect(run(arrows, key("ArrowDown", { metaKey: true }), { typing: true, modal: true })).toBe("editor.next");
    expect(run({ ...declines("editor.previous"), ...accepts("view.first") }, key("ArrowUp", { metaKey: true }))).toBe("view.first");
    // Row keys never fire while typing.
    expect(run(all, key("1"), { typing: true })).toBeUndefined();
  });

  it("maps the legacy task menu, copy link, reveal, sub-task folding and Inbox/sections keys", () => {
    const ids = ["task.menu", "task.copy-url", "task.reveal", "task.toggle-children", "view.toggle-nested", "navigation.inbox", "navigation.sections"];
    const handlers = Object.fromEntries(ids.map(id => [id, vi.fn()]));
    const commands = dispatchCommands(handlers, id => effectiveBindings(id, defaultPreferences(), "mac"));
    const run = (...inputs: ReturnType<typeof key>[]) => { const dispatcher = new KeyboardDispatcher(); return inputs.map((input, index) => dispatcher.dispatch(input, commands, "view", index * 100).commandId).at(-1); };
    expect(run(key("."))).toBe("task.menu");
    expect(run(key("C", { metaKey: true, shiftKey: true }))).toBe("task.copy-url");
    expect(run(key("G", { shiftKey: true }))).toBe("task.reveal");
    expect(run(key("E", { shiftKey: true }))).toBe("task.toggle-children");
    expect(run(key("0", { metaKey: true, altKey: true }))).toBe("view.toggle-nested");
    expect(run(key("g"), key("i"))).toBe("navigation.inbox");
    expect(run(key("g"), key("/"))).toBe("navigation.sections");
    expect(clientCommands.map(command => command.id)).toEqual(expect.arrayContaining(ids));
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

describe("task menu, folding and dialog focus", () => {
  const task = (id: string, parentId: string | null = null) => ({ id, title: id, description: null, status: "todo", priority: 4, projectId: null, sectionId: null, parentId,
    dueDate: null, dueDateEnd: null, deadline: null, completedAt: null, labelIds: [], recurrence: null, updatedAt: null }) as TaskDto;
  const row = (item: TaskDto) => renderToStaticMarkup(createElement(MemoryRouter, null, createElement(TaskRow, { task: item, now: new Date() })));

  it("hides a collapsed parent's sub-tasks and names the parent on each child row", () => {
    collapsedTasks.set(new Set());
    expect(row(task("child", "parent"))).toContain('data-parent-id="parent"');
    expect(row(task("child", "parent"))).not.toContain(" hidden=\"\"");
    collapsedTasks.toggle("parent");
    expect(row(task("child", "parent"))).toContain('hidden=""');
    expect(row(task("parent"))).not.toContain(" hidden=\"\"");
    collapsedTasks.toggle("parent");
    expect(row(task("child", "parent"))).not.toContain(" hidden=\"\"");
  });

  it("offers the legacy Task actions, the first one focused", () => {
    const html = renderToStaticMarkup(createElement(TaskMenu, { title: "Pay rent", onChoose() {}, onClose() {} }));
    expect(html).toContain('role="dialog"');
    expect(html).toContain("Task actions");
    expect(html).toContain("Pay rent");
    for (const name of ["Edit", "Choose date", "Clear date", "Complete", "Delete"]) expect(html).toContain(`>${name}</button>`);
  });

  it("moves focus into a dialog unless a field inside already took it", () => {
    const focus = vi.fn();
    vi.stubGlobal("document", { activeElement: "outside" });
    focusDialog({ contains: (element: unknown) => element === "inside", focus } as never);
    expect(focus).toHaveBeenCalledTimes(1);
    vi.stubGlobal("document", { activeElement: "inside" });
    focusDialog({ contains: (element: unknown) => element === "inside", focus } as never);
    expect(focus).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
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
    expect(html).not.toContain("Paste file as a task");
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
