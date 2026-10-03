import { parsePreferences, snapshotPreferences, validatePreferences, defaultPreferences, type KeyboardPreferences } from "./keyboard";

export interface KeyboardPreferenceStore { read(userId: string): Promise<unknown>; write(userId: string, value: KeyboardPreferences): Promise<void> }
// Identity comes only from the authenticated session reader, never mutation input.
export function keyboardAccountPreferences(requireUserId: () => Promise<string>, store: KeyboardPreferenceStore) {
  return {
    async load(): Promise<{ preferences: KeyboardPreferences; error?: string }> {
      const id = await requireUserId();
      const value = await store.read(id);
      try { return { preferences: parsePreferences(value) }; }
      catch (error) { return { preferences: defaultPreferences(), error: error instanceof Error ? error.message : "Saved shortcuts could not be loaded." }; }
    },
    async save(input: unknown): Promise<KeyboardPreferences> {
      const id = await requireUserId();
      const preferences = parsePreferences(input);
      const errors = validatePreferences(preferences);
      if (errors.length) throw new Error(errors.map(error => `${error.platform}: ${error.message}`).join(" "));
      const snapshot = snapshotPreferences(preferences);
      await store.write(id, snapshot);
      return snapshot;
    },
  };
}
