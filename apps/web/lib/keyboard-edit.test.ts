import { expect, it } from "vitest";
import { defaultPreferences, effectiveBindings } from "./keyboard";
import { editKeyboardBindings } from "./keyboard-edit";
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
