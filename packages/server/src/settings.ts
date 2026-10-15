// Server-only account settings shared by the legacy Server Action and /api/v1.
// Callers authenticate first and pass the session's userId.
import { eq } from "drizzle-orm";
import { db } from "@todalo/db";
import { userSettings } from "@todalo/db/schema";
import type { SettingsDto } from "./settings-input";

export async function getSettings(userId: string): Promise<SettingsDto> {
  const [row] = await db
    .select({ smartDateRecognition: userSettings.smartDateRecognitionEnabled })
    .from(userSettings)
    .where(eq(userSettings.userId, userId));
  return { smartDateRecognition: row?.smartDateRecognition ?? true };
}

export async function setSmartDateRecognition(userId: string, enabled: boolean): Promise<SettingsDto> {
  await db
    .insert(userSettings)
    .values({ userId, smartDateRecognitionEnabled: enabled })
    .onConflictDoUpdate({ target: userSettings.userId, set: { smartDateRecognitionEnabled: enabled, updatedAt: new Date() } });
  return { smartDateRecognition: enabled };
}
