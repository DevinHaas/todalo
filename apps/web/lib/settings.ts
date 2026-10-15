import { getSettings } from "@todalo/server/settings";

// No row yet means the default, unconfigured state — smart date recognition
// on by default, per .scratch/smart-quick-add/spec.md (packages/server/src/settings.ts).
export async function getSmartDateRecognitionEnabled(userId: string): Promise<boolean> {
  return (await getSettings(userId)).smartDateRecognition;
}
