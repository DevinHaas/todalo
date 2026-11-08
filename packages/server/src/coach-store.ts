// Ticket 17: the user's Coach providers and cached status explanations. Every
// read and write is scoped to the caller's userId. Ticket 18 adds the ChatGPT
// sign-in; ticket 17c one configuration per provider kind and the user's pick
// of the active one (pickCoachProvider in coach.ts).
import { and, eq, gte } from "drizzle-orm";
import { db } from "@todalo/db";
import { coachChatgpt, coachChatgptClients, coachExplanations, coachProviderConfigs, coachProviders, coachRecommendations, coachSettings, taskMoves, tasks } from "@todalo/db/schema";
import type { TaskMove } from "./coach-recommendations";
import { openSecret, sealSecret } from "./coach-secret";
import { ChatgptRefusedError, chatgptSharingScope, createChatgptAuth, type ChatgptClient, type ChatgptTokens } from "./coach-chatgpt";
import { coachProviderInfo, pickCoachProvider, type ChatgptDto, type CoachConfig, type CoachModelKind, type CoachProviderKind, type CoachState, type ConfiguredProvider, type StoredCoachProvider } from "./coach";

export type { CoachState, ConfiguredProvider, StoredCoachProvider } from "./coach";

/** This server's ChatGPT sign-in (no configuration: OpenAI registers todalo's client on first sign-in). */
export const chatgptAuth = createChatgptAuth();

type ConfigRow = Pick<typeof coachProviderConfigs.$inferSelect, "provider" | "model" | "baseUrl" | "encryptedKey" | "keyLast4" | "updatedAt">;
/** A key that no longer decrypts (changed secret) reads as missing, so that provider cannot run. */
function opened(row: ConfigRow): ConfiguredProvider {
  let apiKey: string | null = null;
  try { apiKey = row.encryptedKey ? openSecret(row.encryptedKey) : null; } catch { apiKey = null; }
  const provider = row.provider as CoachProviderKind;
  return {
    provider, model: row.model, baseUrl: row.baseUrl, apiKey, keyLast4: apiKey ? row.keyLast4 : null,
    configuredAt: row.updatedAt, usable: !coachProviderInfo[provider].needsKey || apiKey !== null,
  };
}

/**
 * Ticket 17c: every configured provider, the ChatGPT sign-in and the user's
 * pick. The ticket-17 row in coach_providers counts as its kind's
 * configuration until coach_provider_configs has one for that kind (read, never rewritten).
 */
export async function getCoachState(userId: string): Promise<CoachState> {
  // usableChatgpt first: it may refresh the tokens or mark the sign-in expired.
  const tokens = await usableChatgpt(userId);
  const [rows, [legacy], [settings], [signIn]] = await Promise.all([
    db.select().from(coachProviderConfigs).where(eq(coachProviderConfigs.userId, userId)),
    db.select().from(coachProviders).where(eq(coachProviders.userId, userId)),
    db.select().from(coachSettings).where(eq(coachSettings.userId, userId)),
    db.select().from(coachChatgpt).where(eq(coachChatgpt.userId, userId)),
  ]);
  const configured = [...rows, ...legacy && !rows.some(row => row.provider === legacy.provider) ? [legacy] : []].map(opened);
  const chatgpt = signIn ? chatgptDto(signIn, Boolean(tokens)) : null;
  if (signIn) configured.push({
    provider: "chatgpt", model: signIn.model, baseUrl: null, apiKey: tokens?.accessToken ?? null, keyLast4: null,
    configuredAt: signIn.createdAt, usable: Boolean(tokens),
  });
  return { configured, chatgpt, chosen: settings?.activeProvider ?? null };
}

/**
 * The provider the Coach runs on now: the user's pick (default: the most
 * recently configured), or another configured provider when that one cannot
 * run (an expired ChatGPT sign-in). Every Coach caller uses this.
 */
export async function getCoachProvider(userId: string): Promise<StoredCoachProvider | null> {
  const { configured, chosen } = await getCoachState(userId);
  return pickCoachProvider(configured, chosen).provider;
}

export async function setCoachActive(userId: string, provider: CoachModelKind) {
  await db.insert(coachSettings).values({ userId, activeProvider: provider })
    .onConflictDoUpdate({ target: coachSettings.userId, set: { activeProvider: provider, updatedAt: new Date() } });
}

type Sealed = Pick<ChatgptTokens, "clientId" | "accessToken" | "refreshToken"> & { earliestRefreshAt: string | null };
const refreshing = new Map<string, Promise<ChatgptTokens | null>>();

/** The saved tokens. Device-code sign-ins from before (no clientId) read as signed out. */
async function savedChatgpt(userId: string) {
  const [row] = await db.select().from(coachChatgpt).where(eq(coachChatgpt.userId, userId));
  if (!row?.encryptedTokens || !row.expiresAt) return null;
  try {
    const sealed = JSON.parse(openSecret(row.encryptedTokens)) as Sealed;
    if (!sealed.clientId) return null;
    const tokens: ChatgptTokens = { ...sealed, email: row.email, expiresAt: row.expiresAt, earliestRefreshAt: sealed.earliestRefreshAt ? new Date(sealed.earliestRefreshAt) : null, scopes: [chatgptSharingScope] };
    return { row, tokens };
  } catch { return null; }
}

async function usableChatgpt(userId: string, now = new Date()) {
  const saved = await savedChatgpt(userId);
  if (!saved) return null;
  const { row, tokens } = saved;
  const left = tokens.expiresAt.getTime() - now.getTime();
  // Like T3: refresh shortly before expiry, never before OpenAI's earliest_refresh_at.
  if (left > 5 * 60_000 || (left > 0 && tokens.earliestRefreshAt && tokens.earliestRefreshAt > now)) return { ...tokens, model: row.model };
  // OpenAI rotates refresh tokens, so concurrent requests share one refresh.
  // ponytail: per process; a shared lock (or row version) if the API runs on several instances.
  let pending = refreshing.get(userId);
  if (!pending) {
    pending = chatgptAuth.refresh(tokens.clientId, tokens.refreshToken).then(
      async fresh => {
        if (!fresh.scopes.includes(chatgptSharingScope)) throw new ChatgptRefusedError("Plan sharing is off.");
        const kept = { ...fresh, email: fresh.email ?? tokens.email };
        await storeTokens(userId, kept);
        return kept;
      },
    ).catch(async error => {
      if (error instanceof ChatgptRefusedError) await db.update(coachChatgpt).set({ encryptedTokens: null, expiresAt: null }).where(eq(coachChatgpt.userId, userId));
      return null;
    }).finally(() => refreshing.delete(userId));
    refreshing.set(userId, pending);
  }
  const fresh = await pending;
  if (fresh) return { ...fresh, model: row.model };
  return left > 0 ? { ...tokens, model: row.model } : null;
}

const sealTokens = (tokens: ChatgptTokens) => ({
  encryptedTokens: sealSecret(JSON.stringify({ clientId: tokens.clientId, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, earliestRefreshAt: tokens.earliestRefreshAt?.toISOString() ?? null } satisfies Sealed)),
  email: tokens.email, expiresAt: tokens.expiresAt,
});
const storeTokens = (userId: string, tokens: ChatgptTokens) => db.update(coachChatgpt).set(sealTokens(tokens)).where(eq(coachChatgpt.userId, userId));

/** The sign-in as settings show it (no tokens), or null when never signed in. */
export async function getChatgpt(userId: string): Promise<ChatgptDto | null> {
  const [row] = await db.select().from(coachChatgpt).where(eq(coachChatgpt.userId, userId));
  return row ? chatgptDto(row, Boolean(row.encryptedTokens && row.expiresAt)) : null;
}
const chatgptDto = (row: typeof coachChatgpt.$inferSelect, signedIn: boolean): ChatgptDto =>
  ({ status: signedIn ? "signed_in" : "expired", email: row.email, model: row.model });

/** Throws CoachSecretError when COACH_SECRET_KEY is missing. Keeps the chosen model on a new sign-in. */
export async function saveChatgpt(userId: string, tokens: ChatgptTokens) {
  const values = sealTokens(tokens);
  await db.insert(coachChatgpt).values({ userId, model: coachProviderInfo.chatgpt.model, ...values })
    // A new sign-in counts as configured now (createdAt orders it among the providers; refreshes do not).
    .onConflictDoUpdate({ target: coachChatgpt.userId, set: { ...values, createdAt: new Date(), updatedAt: new Date() } });
}

export async function setChatgptModel(userId: string, model: string) {
  await db.update(coachChatgpt).set({ model }).where(eq(coachChatgpt.userId, userId));
}

/** Sign out: OpenAI is asked to revoke the refresh token, the tokens go, another configured provider (if any) takes over. The registration stays. */
export async function removeChatgpt(userId: string) {
  const saved = await savedChatgpt(userId);
  if (saved) await chatgptAuth.revoke(saved.tokens.clientId, saved.tokens.refreshToken);
  await db.delete(coachChatgpt).where(eq(coachChatgpt.userId, userId));
}

const clientRow = (userId: string, redirectKey: string) => and(eq(coachChatgptClients.userId, userId), eq(coachChatgptClients.redirectKey, redirectKey));

export async function getChatgptClient(userId: string, redirectKey: string): Promise<ChatgptClient | null> {
  const [row] = await db.select().from(coachChatgptClients).where(clientRow(userId, redirectKey));
  return row ? { clientId: row.clientId, email: row.email, sharing: row.sharing } : null;
}

export async function saveChatgptClient(userId: string, redirectKey: string, client: ChatgptClient) {
  await db.insert(coachChatgptClients).values({ userId, redirectKey, ...client })
    .onConflictDoUpdate({ target: [coachChatgptClients.userId, coachChatgptClients.redirectKey], set: { ...client, updatedAt: new Date() } });
}

export async function forgetChatgptClient(userId: string, redirectKey: string) {
  await db.delete(coachChatgptClients).where(clientRow(userId, redirectKey));
}

/** One configuration per kind. Throws CoachSecretError when a key must be stored but COACH_SECRET_KEY is missing. */
export async function saveCoachProvider(userId: string, config: CoachConfig) {
  const values = {
    model: config.model, baseUrl: config.baseUrl,
    encryptedKey: config.apiKey ? sealSecret(config.apiKey) : null, keyLast4: config.apiKey ? config.apiKey.slice(-4) : null,
  };
  await db.insert(coachProviderConfigs).values({ userId, provider: config.provider as CoachProviderKind, ...values })
    .onConflictDoUpdate({ target: [coachProviderConfigs.userId, coachProviderConfigs.provider], set: { ...values, updatedAt: new Date() } });
}

/**
 * Disconnect one provider (every keyed one without `provider`): its key and
 * every cached explanation go. The user's own ticket-17 row of that kind goes
 * too, or it would stand in again as that kind's configuration.
 */
export async function removeCoachProvider(userId: string, provider?: CoachProviderKind) {
  await db.delete(coachProviderConfigs).where(and(eq(coachProviderConfigs.userId, userId), provider && eq(coachProviderConfigs.provider, provider)));
  await db.delete(coachProviders).where(and(eq(coachProviders.userId, userId), provider && eq(coachProviders.provider, provider)));
  await db.delete(coachExplanations).where(eq(coachExplanations.userId, userId));
  await db.delete(coachRecommendations).where(eq(coachRecommendations.userId, userId));
}

export const getCachedExplanations = (userId: string) =>
  db.select({ goalId: coachExplanations.goalId, inputsHash: coachExplanations.inputsHash, text: coachExplanations.text })
    .from(coachExplanations).where(eq(coachExplanations.userId, userId));

export async function cacheExplanation(userId: string, goalId: string, inputsHash: string, text: string) {
  await db.insert(coachExplanations).values({ userId, goalId, inputsHash, text })
    .onConflictDoUpdate({ target: [coachExplanations.userId, coachExplanations.goalId], set: { inputsHash, text, createdAt: new Date() } });
}

// ---- Ticket 21: recommendations ----

export const getCachedRecommendations = (userId: string) =>
  db.select({ goalId: coachRecommendations.goalId, inputsHash: coachRecommendations.inputsHash, text: coachRecommendations.text, dismissedAt: coachRecommendations.dismissedAt })
    .from(coachRecommendations).where(eq(coachRecommendations.userId, userId));

/** A new text keeps the goal's dismissal (it hides for the rest of that season week either way). */
export async function cacheRecommendation(userId: string, goalId: string, inputsHash: string, text: string) {
  await db.insert(coachRecommendations).values({ userId, goalId, inputsHash, text })
    .onConflictDoUpdate({ target: [coachRecommendations.userId, coachRecommendations.goalId], set: { inputsHash, text, createdAt: new Date() } });
}

/** False when the goal has no recommendation to dismiss. */
export async function dismissRecommendation(userId: string, goalId: string, at: Date) {
  const rows = await db.update(coachRecommendations).set({ dismissedAt: at })
    .where(and(eq(coachRecommendations.userId, userId), eq(coachRecommendations.goalId, goalId))).returning({ goalId: coachRecommendations.goalId });
  return rows.length > 0;
}

/** The goal's recommendation text unless dismissed (Update schedule drafts from it). */
export async function getRecommendation(userId: string, goalId: string) {
  const [row] = await db.select({ text: coachRecommendations.text, dismissedAt: coachRecommendations.dismissedAt }).from(coachRecommendations)
    .where(and(eq(coachRecommendations.userId, userId), eq(coachRecommendations.goalId, goalId)));
  return row && !row.dismissedAt ? row.text : null;
}

/** Moves of the user's tasks since `since`, with each task's project (goal links run through it). */
export const getTaskMoves = (userId: string, since: Date): Promise<TaskMove[]> =>
  db.select({ taskId: taskMoves.taskId, projectId: tasks.projectId, fromDate: taskMoves.fromDate, movedAt: taskMoves.movedAt }).from(taskMoves)
    .innerJoin(tasks, eq(tasks.id, taskMoves.taskId))
    .where(and(eq(taskMoves.userId, userId), gte(taskMoves.movedAt, since)));
