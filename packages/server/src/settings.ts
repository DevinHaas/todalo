// Server-only account settings shared by the legacy Server Action and /api/v1.
// Callers authenticate first and pass the session's userId.
import { eq } from "drizzle-orm";
import { db } from "@todalo/db";
import { userSettings } from "@todalo/db/schema";
import type { SettingsDto } from "./settings-input";

export async function getSettings(userId: string): Promise<SettingsDto> {
  const [row] = await db
    .select({ smartDateRecognition: userSettings.smartDateRecognitionEnabled, shareEventTitles: userSettings.coachShareEventTitles })
    .from(userSettings)
    .where(eq(userSettings.userId, userId));
  return { smartDateRecognition: row?.smartDateRecognition ?? true, shareEventTitles: row?.shareEventTitles ?? false };
}

/** Writes only the preferences given; the rest keep their value (or default). */
export async function updateSettings(userId: string, input: Partial<SettingsDto>): Promise<SettingsDto> {
  const set = {
    ...(input.smartDateRecognition !== undefined && { smartDateRecognitionEnabled: input.smartDateRecognition }),
    ...(input.shareEventTitles !== undefined && { coachShareEventTitles: input.shareEventTitles }),
  };
  await db
    .insert(userSettings)
    .values({ userId, ...set })
    .onConflictDoUpdate({ target: userSettings.userId, set: { ...set, updatedAt: new Date() } });
  return getSettings(userId);
}

export const setSmartDateRecognition = (userId: string, enabled: boolean) => updateSettings(userId, { smartDateRecognition: enabled });
