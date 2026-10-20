import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient } from "@tanstack/react-query";
import { AccountTransportError } from "./errors";
import { Composer, ComposerChoices, CustomRepeatDialog } from "./composer";
import { ProjectView } from "./project-views";
import { TaskEditor } from "./views";
import type { TaskDto } from "./tasks";
import { browserSettingsTransport, settingsKeys, settingsMutations, type SettingsTransport } from "./settings";
import { SmartDatesSetting } from "./settings-views";

const render = (node: ReturnType<typeof createElement>) => renderToStaticMarkup(node);
const noop = () => {};

describe("smart quick add composer", () => {
  it("renders the highlight backdrop, date pill and legacy Inbox pill", () => {
    const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
    const html = render(createElement(Composer, { startOpen: true, dueDate: () => midnight.toISOString(), onCreate: async () => {} }));
    expect(html).toContain('class="quick-add-backdrop" aria-hidden="true"');
    expect(html).toContain('aria-label="Date: Today"');
    expect(html).toContain('aria-label="Clear date"');
    expect(html).toContain("Inbox");
    // A schedule slot keeps its time range and label.
    const slot = render(createElement(Composer, { startOpen: true, destination: "Fri 16 Oct", dueDate: () => new Date(2026, 9, 16, 9).toISOString(), dueDateEnd: () => new Date(2026, 9, 16, 10).toISOString(), onCreate: async () => {} }));
    expect(slot).toContain('aria-label="Date: Fri 16 Oct 09:00-10:00"');
    expect(render(createElement(Composer, { startOpen: true, dueDate: () => null, onCreate: async () => {} }))).toContain('aria-label="Date: No Date"');
  });

  it("offers a real project picker (Inbox first) and the Additional actions and position controls", () => {
    const choices = { projects: [{ id: "work", name: "Work" }, { id: "errands", name: "Errands" }], labels: [{ id: "design", name: "Design" }] };
    const html = render(createElement(ComposerChoices.Provider, { value: choices }, createElement(Composer, { startOpen: true, dueDate: () => null, projectId: "work", sectionId: "doing", placement: { edge: "bottom" }, onCreate: async () => {} })));
    expect(html).toMatch(/<select aria-label="Project"><option value="">Inbox<\/option><option value="work" selected="">Work<\/option><option value="errands">Errands<\/option>/);
    expect(html).toContain('aria-label="Additional actions" aria-expanded="false"');
    expect(html).toContain(">Priority 4<");
    expect(html).toContain('aria-label="Position: bottom"');
    // An insert next to a task has no top/bottom toggle; projects still loading keep the composer's own.
    const insert = render(createElement(Composer, { startOpen: true, dueDate: () => null, projectId: "work", placement: { edge: "below", anchorId: "t" }, onCreate: async () => {} }));
    expect(insert).not.toContain("Position:");
    expect(insert).toContain('<option value="work" selected="">This project</option>');
  });

  it("activates Add task in every project section", () => {
    const work = { id: "work", name: "Work", color: null } as never;
    const props = { state: { status: "success" as const, data: { project: work, sections: [{ id: "doing", projectId: "work", name: "Doing", sortOrder: 0 }], tasks: [] }, error: null }, onRetry: noop, onRename: async () => {}, onDelete: noop, write: { pending: false, error: null } };
    const html = render(createElement(ProjectView, { ...props, onCreate: async () => {} } as never));
    expect(html.match(/<button type="button" class="composer">/g)).toHaveLength(2);
    expect(render(createElement(ProjectView, props as never))).toContain('<span class="composer" aria-disabled="true">');
  });

  it("shows Save and add above/below in the editor only when it can insert", () => {
    const task = { id: "t", title: "Plan", description: null, status: "todo", priority: 4, projectId: "work", sectionId: null, parentId: null, dueDate: null, dueDateEnd: null, deadline: null, completedAt: null, labelIds: [], recurrence: null, updatedAt: "2026-10-20T00:00:00.000Z" } as unknown as TaskDto;
    const html = render(createElement(TaskEditor, { task, onSave: async () => {}, onClose: noop, onInsert: noop }));
    expect(html).toContain('data-insert="above"');
    expect(html).toContain(">Save and add below<");
    expect(render(createElement(TaskEditor, { task, onSave: async () => {}, onClose: noop }))).not.toContain("Save and add");
  });

  it("opens the legacy custom repeat dialog seeded from the current rule", () => {
    const html = render(createElement(CustomRepeatDialog, { recurrence: { n: 3, unit: "week", basedOn: "completed", until: new Date(2026, 11, 31) }, onClose: noop, onConfirm: noop }));
    for (const fragment of ["Custom repeat", 'value="3"', '<option value="week" selected="">weeks</option>', 'aria-pressed="true">Completed date', 'aria-pressed="true">On date', 'value="2026-12-31"']) {
      expect(html).toContain(fragment);
    }
  });
});

describe("account settings", () => {
  const respond = (status: number, body?: unknown) => {
    const calls: RequestInit[] = [];
    const fetcher = (async (_path: string, init: RequestInit) => { calls.push(init); return new Response(body === undefined ? null : JSON.stringify(body), { status }); }) as unknown as typeof fetch;
    return { calls, transport: browserSettingsTransport(fetcher) };
  };

  it("reads and saves only the allow-listed preference with the shared error codes", async () => {
    const read = respond(200, { settings: { smartDateRecognition: false, userId: "bob" } });
    expect(await read.transport.get()).toEqual({ smartDateRecognition: false });
    expect(read.calls[0]).toMatchObject({ method: "GET", credentials: "same-origin", cache: "no-store" });
    const save = respond(200, { settings: { smartDateRecognition: true } });
    await save.transport.update({ smartDateRecognition: true });
    expect(save.calls[0]).toMatchObject({ method: "PATCH", body: '{"smartDateRecognition":true}' });
    await expect(respond(401).transport.get()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(respond(500).transport.get()).rejects.toMatchObject({ code: "SETTINGS_UNAVAILABLE" });
    await expect(respond(500).transport.update({ smartDateRecognition: true })).rejects.toMatchObject({ code: "SAVE_FAILED" });
    await expect(respond(200, { settings: {} }).transport.get()).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("flips the cached setting at once and rolls it back when the save fails", async () => {
    const cache = new QueryClient();
    const key = settingsKeys.settings("alice");
    expect(key).toEqual(["user", "alice", "settings"]);
    cache.setQueryData(key, { smartDateRecognition: true });
    const failing: SettingsTransport = { get: async () => ({ smartDateRecognition: true }), update: async () => { throw new AccountTransportError("SAVE_FAILED"); } };
    const { update } = settingsMutations(failing, cache, "alice");
    const snapshot = await update.onMutate({ smartDateRecognition: false });
    expect(cache.getQueryData(key)).toEqual({ smartDateRecognition: false });
    update.onError(new AccountTransportError("SAVE_FAILED"), { smartDateRecognition: false }, snapshot);
    expect(cache.getQueryData(key)).toEqual({ smartDateRecognition: true });
    expect(update.retry(0, new AccountTransportError("SAVE_FAILED"))).toBe(true);
    expect(update.retry(0, new AccountTransportError("INVALID_INPUT"))).toBe(false);
  });

  it("shows the setting, a loading state and a retryable load failure", () => {
    const props = { onRetry: noop, onChange: noop, pending: false, error: null };
    expect(render(createElement(SmartDatesSetting, { ...props, state: { status: "success", data: { smartDateRecognition: true }, error: null } }))).toMatch(/type="checkbox" checked=""/);
    expect(render(createElement(SmartDatesSetting, { ...props, state: { status: "success", data: { smartDateRecognition: false }, error: null } }))).not.toContain("checked");
    expect(render(createElement(SmartDatesSetting, { ...props, state: { status: "pending", error: null } }))).toContain("Loading preferences");
    const failed = render(createElement(SmartDatesSetting, { ...props, state: { status: "error", error: new Error("x") } }));
    expect(failed).toContain("Your preferences could not be loaded.");
    expect(failed).toContain("Try again");
    expect(render(createElement(SmartDatesSetting, { ...props, error: "Your changes could not be saved. Try again. The setting was not changed.", state: { status: "success", data: { smartDateRecognition: true }, error: null } }))).toContain('role="alert"');
  });
});
