// Server-only account keyboard shortcuts shared by the legacy Server Action and
// /api/v1 (ticket 19). Callers authenticate first and pass the session's userId.
import { eq } from "drizzle-orm";
import { db } from "@todalo/db";
import { userKeyboardPreferences } from "@todalo/db/schema";
import { keyboardAccountPreferences, type KeyboardPreferenceStore } from "@todalo/ramble/keyboard-account-preferences";

export const keyboardPreferenceStore: KeyboardPreferenceStore = {
  async read(userId) {
    const [row] = await db.select({ preferences: userKeyboardPreferences.preferences }).from(userKeyboardPreferences).where(eq(userKeyboardPreferences.userId, userId));
    return row?.preferences;
  },
  async write(userId, value) {
    await db.insert(userKeyboardPreferences).values({ userId, preferences: value }).onConflictDoUpdate({ target: userKeyboardPreferences.userId, set: { preferences: value, updatedAt: new Date() } });
  },
};

const account = (userId: string) => keyboardAccountPreferences(async () => userId, keyboardPreferenceStore);
/** Unreadable saved preferences load as defaults plus an error, so shortcuts still work. */
export const loadKeyboardPreferences = (userId: string) => account(userId).load();
/** Throws KeyboardPreferencesError for invalid, conflicting or reserved bindings. */
export const saveKeyboardPreferences = (userId: string, input: unknown) => account(userId).save(input);
