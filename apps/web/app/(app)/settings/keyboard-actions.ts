"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userKeyboardPreferences } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { keyboardAccountPreferences } from "@/lib/keyboard-account-preferences";

const preferences = keyboardAccountPreferences(requireUserId, {
  async read(userId) {
    const [row] = await db.select({ preferences: userKeyboardPreferences.preferences }).from(userKeyboardPreferences).where(eq(userKeyboardPreferences.userId, userId));
    return row?.preferences;
  },
  async write(userId, value) {
    await db.insert(userKeyboardPreferences).values({ userId, preferences: value }).onConflictDoUpdate({ target: userKeyboardPreferences.userId, set: { preferences: value, updatedAt: new Date() } });
  },
});
export async function loadKeyboardPreferences() { return preferences.load(); }
export async function saveKeyboardPreferences(input: unknown) { return preferences.save(input); }
