// Ticket 17: the user's Coach provider and cached status explanations. Every
// read and write is scoped to the caller's userId. Ticket 18 adds the ChatGPT
// sign-in beside it: while signed in the Coach runs on ChatGPT, otherwise on
// the saved key or Ollama provider.
import { eq } from "drizzle-orm";
import { db } from "@todalo/db";
import { coachChatgpt, coachExplanations, coachProviders } from "@todalo/db/schema";
import { openSecret, sealSecret } from "./coach-secret";
import { ChatgptRefusedError, createChatgptAuth, type ChatgptAuth, type ChatgptTokens } from "./coach-chatgpt";
import { coachProviderInfo, type ChatgptDto, type CoachConfig, type CoachProviderKind } from "./coach";

export type StoredCoachProvider = CoachConfig & { keyLast4: string | null };

/** This server's ChatGPT sign-in, or null when CHATGPT_OAUTH_CLIENT_ID is not set (no sign-in offered). */
export const chatgptAuth: ChatgptAuth | null = process.env.CHATGPT_OAUTH_CLIENT_ID ? createChatgptAuth(process.env.CHATGPT_OAUTH_CLIENT_ID) : null;

/** The saved key or Ollama provider with its key decrypted; a key that no longer decrypts (changed secret) reads as missing. */
export async function getKeyProvider(userId: string): Promise<StoredCoachProvider | null> {
  const [row] = await db.select().from(coachProviders).where(eq(coachProviders.userId, userId));
  if (!row) return null;
  let apiKey: string | null = null;
  try { apiKey = row.encryptedKey ? openSecret(row.encryptedKey) : null; } catch { apiKey = null; }
  return { provider: row.provider as CoachProviderKind, model: row.model, baseUrl: row.baseUrl, apiKey, keyLast4: apiKey ? row.keyLast4 : null };
}

/**
 * The provider the Coach runs on now: ChatGPT while signed in (refreshing its
 * token shortly before expiry), else the saved key or Ollama provider. A
 * refused refresh marks the sign-in expired and falls back. Every Coach caller uses this.
 */
export async function getCoachProvider(userId: string): Promise<StoredCoachProvider | null> {
  const tokens = await usableChatgpt(userId);
  if (tokens) return { provider: "chatgpt", model: tokens.model, baseUrl: null, apiKey: tokens.accessToken, accountId: tokens.accountId, keyLast4: null };
  return getKeyProvider(userId);
}

const refreshing = new Map<string, Promise<ChatgptTokens | null>>();

async function usableChatgpt(userId: string, now = new Date()) {
  const [row] = await db.select().from(coachChatgpt).where(eq(coachChatgpt.userId, userId));
  if (!row?.encryptedTokens || !row.expiresAt) return null;
  let tokens: ChatgptTokens;
  try { tokens = { ...JSON.parse(openSecret(row.encryptedTokens)) as Pick<ChatgptTokens, "accessToken" | "refreshToken">, accountId: row.accountId, email: row.email, expiresAt: row.expiresAt }; }
  catch { return null; }
  if (tokens.expiresAt.getTime() - now.getTime() > 5 * 60_000 || !chatgptAuth) return tokens.expiresAt > now ? { ...tokens, model: row.model } : null;
  // OpenAI rotates refresh tokens, so concurrent requests share one refresh.
  // ponytail: per process; a shared lock (or row version) if the API runs on several instances.
  let pending = refreshing.get(userId);
  if (!pending) {
    pending = chatgptAuth.refresh(tokens.refreshToken).then(
      async fresh => { await storeTokens(userId, fresh); return fresh; },
      async error => {
        if (error instanceof ChatgptRefusedError) await db.update(coachChatgpt).set({ encryptedTokens: null, expiresAt: null }).where(eq(coachChatgpt.userId, userId));
        return null;
      },
    ).finally(() => refreshing.delete(userId));
    refreshing.set(userId, pending);
  }
  const fresh = await pending;
  if (fresh) return { ...fresh, model: row.model };
  return tokens.expiresAt > now ? { ...tokens, model: row.model } : null;
}

const storeTokens = (userId: string, tokens: ChatgptTokens) => db.update(coachChatgpt).set({
  encryptedTokens: sealSecret(JSON.stringify({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken })),
  accountId: tokens.accountId, email: tokens.email, expiresAt: tokens.expiresAt,
}).where(eq(coachChatgpt.userId, userId));

/** The sign-in as settings show it (no tokens), or null when never signed in. */
export async function getChatgpt(userId: string): Promise<ChatgptDto | null> {
  const [row] = await db.select().from(coachChatgpt).where(eq(coachChatgpt.userId, userId));
  if (!row) return null;
  return { status: row.encryptedTokens && row.expiresAt ? "signed_in" : "expired", email: row.email, model: row.model };
}

/** Throws CoachSecretError when COACH_SECRET_KEY is missing. Keeps the chosen model on a new sign-in. */
export async function saveChatgpt(userId: string, tokens: ChatgptTokens) {
  const sealed = sealSecret(JSON.stringify({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken }));
  const values = { encryptedTokens: sealed, accountId: tokens.accountId, email: tokens.email, expiresAt: tokens.expiresAt };
  await db.insert(coachChatgpt).values({ userId, model: coachProviderInfo.chatgpt.model, ...values })
    .onConflictDoUpdate({ target: coachChatgpt.userId, set: { ...values, updatedAt: new Date() } });
}

export async function setChatgptModel(userId: string, model: string) {
  await db.update(coachChatgpt).set({ model }).where(eq(coachChatgpt.userId, userId));
}

/** Sign out: the tokens go; the key provider, if any, takes over. */
export async function removeChatgpt(userId: string) {
  await db.delete(coachChatgpt).where(eq(coachChatgpt.userId, userId));
}

/** Throws CoachSecretError when a key must be stored but COACH_SECRET_KEY is missing. */
export async function saveCoachProvider(userId: string, config: CoachConfig) {
  const values = {
    provider: config.provider as CoachProviderKind, model: config.model, baseUrl: config.baseUrl,
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
