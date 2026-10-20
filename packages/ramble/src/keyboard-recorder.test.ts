import { describe, expect, it, vi } from "vitest";
import { createShortcutRecorder } from "./keyboard-recorder";

const event = (key: string, changes = {}) => ({ key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, repeat: false, isComposing: false, preventDefault: vi.fn(), stopImmediatePropagation: vi.fn(), ...changes });

describe("single chord shortcut recording", () => {
  it("finishes immediately on one completed chord and ignores subsequent keys", () => {
    const save = vi.fn();
    const record = createShortcutRecorder("portable", "mac", save);
    const first = event("r", { metaKey: true, shiftKey: true });
    record(first);
    record(event("a"));
    expect(save).toHaveBeenCalledExactlyOnceWith("Primary+Shift+r");
    expect(first.preventDefault).toHaveBeenCalledOnce();
    expect(first.stopImmediatePropagation).toHaveBeenCalledOnce();
  });
  it("waits through modifiers, repeated keys and IME before a complete binding", () => {
    const save = vi.fn();
    const record = createShortcutRecorder("windows", "windows", save);
    record(event("Control", { ctrlKey: true }));
    record(event("x", { repeat: true }));
    record(event("x", { isComposing: true }));
    record(event("Dead"));
    expect(save).not.toHaveBeenCalled();
    record(event("x", { ctrlKey: true }));
    expect(save).toHaveBeenCalledExactlyOnceWith("Ctrl+x");
  });
  it("keeps Escape bindable and adapts Control for portable Windows bindings", () => {
    const save = vi.fn();
    createShortcutRecorder("portable", "windows", save)(event("Escape"));
    expect(save).toHaveBeenLastCalledWith("Escape");
    createShortcutRecorder("portable", "windows", save)(event("k", { ctrlKey: true }));
    expect(save).toHaveBeenLastCalledWith("Primary+k");
  });
});
