import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userSettings } from "@/db/schema";

// No row yet means the default, unconfigured state — smart date recognition
// on by default, per .scratch/smart-quick-add/spec.md.
export async function getSmartDateRecognitionEnabled(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ smartDateRecognitionEnabled: userSettings.smartDateRecognitionEnabled })
    .from(userSettings)
    .where(eq(userSettings.userId, userId));
  return row?.smartDateRecognitionEnabled ?? true;
}
