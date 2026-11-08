// Ticket 17: the user's Coach provider and cached status explanations. Every
// read and write is scoped to the caller's userId.
import { eq } from "drizzle-orm";
import { db } from "@todalo/db";
import { coachExplanations, coachProviders } from "@todalo/db/schema";
import { openSecret, sealSecret } from "./coach-secret";
import type { CoachConfig } from "./coach";

export type StoredCoachProvider = CoachConfig & { keyLast4: string | null };

/** The saved provider with its key decrypted; a key that no longer decrypts (changed secret) reads as missing. */
export async function getCoachProvider(userId: string): Promise<StoredCoachProvider | null> {
  const [row] = await db.select().from(coachProviders).where(eq(coachProviders.userId, userId));
  if (!row) return null;
  let apiKey: string | null = null;
  try { apiKey = row.encryptedKey ? openSecret(row.encryptedKey) : null; } catch { apiKey = null; }
  return { provider: row.provider, model: row.model, baseUrl: row.baseUrl, apiKey, keyLast4: apiKey ? row.keyLast4 : null };
}

/** Throws CoachSecretError when a key must be stored but COACH_SECRET_KEY is missing. */
export async function saveCoachProvider(userId: string, config: CoachConfig) {
  const values = {
    provider: config.provider, model: config.model, baseUrl: config.baseUrl,
    encryptedKey: config.apiKey ? sealSecret(config.apiKey) : null, keyLast4: config.apiKey ? config.apiKey.slice(-4) : null,
  };
  await db.insert(coachProviders).values({ userId, ...values }).onConflictDoUpdate({ target: coachProviders.userId, set: { ...values, updatedAt: new Date() } });
}

/** Disconnect: the key and every cached explanation go. */
export async function removeCoachProvider(userId: string) {
  await db.delete(coachProviders).where(eq(coachProviders.userId, userId));
  await db.delete(coachExplanations).where(eq(coachExplanations.userId, userId));
}

export const getCachedExplanations = (userId: string) =>
  db.select({ goalId: coachExplanations.goalId, inputsHash: coachExplanations.inputsHash, text: coachExplanations.text })
    .from(coachExplanations).where(eq(coachExplanations.userId, userId));

export async function cacheExplanation(userId: string, goalId: string, inputsHash: string, text: string) {
  await db.insert(coachExplanations).values({ userId, goalId, inputsHash, text })
    .onConflictDoUpdate({ target: [coachExplanations.userId, coachExplanations.goalId], set: { inputsHash, text, createdAt: new Date() } });
}
