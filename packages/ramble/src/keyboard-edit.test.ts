import { expect, it } from "vitest";
import { defaultPreferences, effectiveBindings, KeyboardDispatcher, parsePreferences, snapshotPreferences } from "./keyboard";
import { editKeyboardBindings } from "./keyboard-edit";
it("removing the last binding leaves an empty assignment that does not dispatch, and restore enables it", () => {
  const empty = editKeyboardBindings(defaultPreferences(), "general.capture", "portable", { remove: 0 });
  const persisted = parsePreferences(snapshotPreferences(empty));
  const dispatcher = new KeyboardDispatcher();
  const key = { key: "q", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, repeat: false };
  for (const platform of ["mac", "windows", "linux"] as const) {
    const bindings = effectiveBindings("general.capture", persisted, platform);
    expect(bindings).toEqual([]);
    expect(dispatcher.dispatch(key, [{ id: "general.capture", bindings }], "global").consumed).toBe(false);
  }
  const restored = editKeyboardBindings(persisted, "general.capture", "portable", { reset: true });
  expect(dispatcher.dispatch(key, [{ id: "general.capture", bindings: effectiveBindings("general.capture", restored, "mac") }], "global").commandId).toBe("general.capture");
});
it("preserves legacy empty overrides and restores only the requested platform", () => {
  const legacy = parsePreferences({ ...defaultPreferences(), overrides: { "general.capture": [] } });
  expect(effectiveBindings("general.capture", legacy, "mac")).toEqual([]);
  const restored = editKeyboardBindings(legacy, "general.capture", "mac", { reset: true });
  expect(effectiveBindings("general.capture", restored, "mac")).toEqual(["q"]);
  expect(effectiveBindings("general.capture", restored, "windows")).toEqual([]);
});
it("preserves distinct platform defaults when adding portable alternates", () => {
  const next = editKeyboardBindings(defaultPreferences(), "task.delete", "portable", { add: "Primary+Shift+9" });
  expect(effectiveBindings("task.delete", next, "mac")).toEqual(["Meta+Backspace", "Meta+Shift+9"]);
  expect(effectiveBindings("task.delete", next, "windows")).toEqual(["Shift+Delete", "Ctrl+Shift+9"]);
});
it("replaces the displayed binding and restores platform defaults", () => {
  const next = editKeyboardBindings(defaultPreferences(), "task.delete", "portable", { replace: 0, binding: "Primary+Shift+9" });
  expect(effectiveBindings("task.delete", next, "mac")).toEqual(["Meta+Shift+9"]);
  expect(effectiveBindings("task.delete", next, "windows")).toEqual(["Ctrl+Shift+9"]);
  const reset = editKeyboardBindings(next, "task.delete", "portable", { reset: true });
  expect(effectiveBindings("task.delete", reset, "mac")).toEqual(["Meta+Backspace"]);
  expect(effectiveBindings("task.delete", reset, "windows")).toEqual(["Shift+Delete"]);
});
it("keeps platform-specific alternate sets when editing an index absent elsewhere", () => {
  const next = editKeyboardBindings(defaultPreferences(), "calendar.today", "portable", { replace: 1, binding: "Primary+Shift+9" });
  expect(effectiveBindings("calendar.today", next, "mac")).toEqual(["t", "Meta+Shift+9"]);
  expect(effectiveBindings("calendar.today", next, "windows")).toEqual(["t", "Ctrl+Shift+9"]);
  const onlyMac = editKeyboardBindings(next, "calendar.today", "mac", { remove: 1 });
  expect(effectiveBindings("calendar.today", onlyMac, "mac")).toEqual(["t"]);
  expect(effectiveBindings("calendar.today", onlyMac, "windows")).toEqual(["t", "Ctrl+Shift+9"]);
});
