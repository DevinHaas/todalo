import { effectiveBindings, type KeyboardPreferences, type Platform } from "./keyboard";

type Edit = { add: string } | { replace: number; binding: string } | { remove: number } | { disable: true } | { reset: true } | { bindings: string[] };
// All-platform edits apply the same operation to each platform's current set,
// preserving its native defaults instead of copying another platform's keys.
export function editKeyboardBindings(preferences: KeyboardPreferences, id: string, profile: "portable" | Platform, edit: Edit): KeyboardPreferences {
  const next = structuredClone(preferences);
  const platforms: Platform[] = profile === "portable" ? ["mac", "windows", "linux"] : [profile];
  for (const platform of platforms) {
    const map = next.platforms[platform] ??= {};
    if ("reset" in edit) { delete map[id]; continue; }
    const bindings = [...effectiveBindings(id, preferences, platform)];
    if ("add" in edit) bindings.push(edit.add);
    if ("replace" in edit) {
      if (edit.replace < bindings.length) bindings[edit.replace] = edit.binding;
      else bindings.push(edit.binding);
    }
    map[id] = "disable" in edit ? [] : "bindings" in edit ? edit.bindings : "remove" in edit ? bindings.filter((_, index) => index !== edit.remove) : bindings;
  }
  if (profile === "portable") delete next.overrides[id];
  return next;
}
