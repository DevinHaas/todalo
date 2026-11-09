// Pure account-settings schema and DTO (zod only, client-safe).
import { z } from "zod";

/**
 * Per-account preferences. No row yet means the defaults (smart dates on).
 * Goals ticket 28: shareEventTitles, Settings › Coach "Share event titles with the AI" (off).
 */
export interface SettingsDto { smartDateRecognition: boolean; shareEventTitles: boolean }

/** PATCH /api/v1/settings: the preferences the shared client edits (ticket 12); only those sent change. */
export const settingsInput = z.object({ smartDateRecognition: z.boolean().optional(), shareEventTitles: z.boolean().optional() }).strict()
  .refine(input => input.smartDateRecognition !== undefined || input.shareEventTitles !== undefined);
