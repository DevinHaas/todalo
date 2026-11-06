// Pure account-settings schema and DTO (zod only, client-safe).
import { z } from "zod";

/** Per-account preferences. No row yet means the defaults (smart dates on). */
export interface SettingsDto { smartDateRecognition: boolean }

/** PATCH /api/v1/settings: the one preference the shared client edits (ticket 12). */
export const settingsInput = z.object({ smartDateRecognition: z.boolean() }).strict();
