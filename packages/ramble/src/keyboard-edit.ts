import { adaptBinding, contextsOverlap, defaultPreferences, effectiveBindings, keyboardCommands, normalizeBinding, type KeyboardPreferences, type Platform } from "./keyboard";

type Edit = { add: string } | { replace: number; binding: string } | { remove: number } | { reset: true } | { bindings: string[] };
// All-platform edits apply the same operation to each platform's current set,
// preserving its native defaults instead of copying another platform's keys.
export function editKeyboardBindings(preferences: KeyboardPreferences, id: string, profile: "portable" | Platform, edit: Edit): KeyboardPreferences {
  const next = structuredClone(preferences);
  const platforms: Platform[] = profile === "portable" ? ["mac", "windows", "linux"] : [profile];
  for (const platform of platforms) {
    const map = next.platforms[platform] ??= {};
    if ("reset" in edit) {
      // A legacy all-platform override must not mask a platform-only restore.
      if (profile !== "portable" && preferences.overrides[id] !== undefined) map[id] = effectiveBindings(id, defaultPreferences(), platform);
      else delete map[id];
      continue;
    }
    const bindings = [...effectiveBindings(id, preferences, platform)];
    if ("add" in edit) bindings.push(edit.add);
    if ("replace" in edit) {
      if (edit.replace < bindings.length) bindings[edit.replace] = edit.binding;
      else bindings.push(edit.binding);
    }
    map[id] = "bindings" in edit ? edit.bindings : "remove" in edit ? bindings.filter((_, index) => index !== edit.remove) : bindings;
  }
  if (profile === "portable") delete next.overrides[id];
  return next;
}

/**
 * "Replace?" on a conflict: takes `binding` away from every other action it
 * collides with (same keys, or one is a sequence prefix of the other) in an
 * overlapping context, on the platforms `profile` edits. Their other keys stay.
 */
export function releaseBinding(preferences: KeyboardPreferences, id: string, profile: "portable" | Platform, binding: string, registry = keyboardCommands): KeyboardPreferences {
  const target = registry.find(item => item.id === id);
  if (!target) return preferences;
  const next = structuredClone(preferences);
  for (const platform of profile === "portable" ? (["mac", "windows", "linux"] as const) : [profile]) {
    const mine = normalizeBinding(adaptBinding(binding, platform));
    if (!mine) continue;
    const clashes = (other: string) => {
      const theirs = normalizeBinding(other);
      return theirs !== null && (theirs === mine || theirs.startsWith(`${mine} then `) || mine.startsWith(`${theirs} then `));
    };
    for (const item of registry) {
      if (item.id === id || ["excluded", "native", "disputed"].includes(item.availability) || !contextsOverlap(item.context, target.context)) continue;
      const bindings = effectiveBindings(item.id, preferences, platform, registry);
      const kept = bindings.filter(other => !clashes(other));
      if (kept.length !== bindings.length) (next.platforms[platform] ??= {})[item.id] = kept;
    }
  }
  return next;
}
