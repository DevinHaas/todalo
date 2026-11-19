// Server-only: the account's personalization document (Settings › Appearance and Sidebar).
// Callers authenticate first and pass the session's userId.
import { eq } from "drizzle-orm";
import { db } from "@todalo/db";
import { userPersonalization } from "@todalo/db/schema";
import { personalizationInput, readPersonalization, type PersonalizationDto } from "./personalization-dto";

/** The saved document, or null when the account never saved one (the client keeps its local theme then). */
export async function loadPersonalization(userId: string): Promise<PersonalizationDto | null> {
  const [row] = await db.select({ document: userPersonalization.document }).from(userPersonalization).where(eq(userPersonalization.userId, userId));
  return row ? readPersonalization(row.document) : null;
}

/** Validates, then replaces the whole document; null when the input is invalid. */
export async function savePersonalization(userId: string, input: unknown): Promise<PersonalizationDto | null> {
  const parsed = personalizationInput.safeParse(input);
  if (!parsed.success) return null;
  await db.insert(userPersonalization).values({ userId, document: parsed.data })
    .onConflictDoUpdate({ target: userPersonalization.userId, set: { document: parsed.data, updatedAt: new Date() } });
  return parsed.data;
}
