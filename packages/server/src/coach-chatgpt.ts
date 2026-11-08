// Goals ticket 18: ChatGPT sign-in for the Coach (ADR 0007) with OpenAI's
// device code flow on auth.openai.com, the flow the Codex CLI uses for
// headless logins. It needs no redirect back to todalo, so it works the same on
// web, Mac and iPhone: the user opens a page, enters a code, and the server
// polls until OpenAI hands over tokens.
//
// OpenAI documents no sign-in for third-party apps. The OAuth client ID is
// therefore not built in: it comes from CHATGPT_OAUTH_CLIENT_ID, and without it
// the server offers no ChatGPT sign-in (see the ticket for the user's decision).
import { CoachModelError } from "./coach";

export const chatgptIssuer = "https://auth.openai.com";
export const chatgptVerificationUrl = `${chatgptIssuer}/codex/device`;

/** What the user sees while signing in. */
export interface ChatgptDeviceCode { deviceAuthId: string; userCode: string; intervalSeconds: number }
/** Tokens after sign-in or refresh, plus who they belong to (from the JWT claims, for display and the account header). */
export interface ChatgptTokens { accessToken: string; refreshToken: string; accountId: string | null; email: string | null; expiresAt: Date }

/** The sign-in calls the API makes; tests replace it with an in-memory fake. */
export interface ChatgptAuth {
  start(): Promise<ChatgptDeviceCode>;
  /** Tokens once the user approved, null while still waiting. */
  poll(code: ChatgptDeviceCode): Promise<ChatgptTokens | null>;
  /** New tokens; throws ChatgptRefusedError when OpenAI refuses the refresh token (signed out, revoked). */
  refresh(refreshToken: string): Promise<ChatgptTokens>;
}

/** OpenAI refused the sign-in for good: the user has to sign in again. */
export class ChatgptRefusedError extends Error {}

const json = (body: unknown) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

/** The HTTP requests of the flow. Pure, so they are table-tested. */
export const chatgptRequests = {
  deviceCode: (clientId: string) => ({ url: `${chatgptIssuer}/api/accounts/deviceauth/usercode`, init: json({ client_id: clientId }) }),
  deviceToken: (code: ChatgptDeviceCode) =>
    ({ url: `${chatgptIssuer}/api/accounts/deviceauth/token`, init: json({ device_auth_id: code.deviceAuthId, user_code: code.userCode }) }),
  exchange: (clientId: string, authorizationCode: string, codeVerifier: string) => ({
    url: `${chatgptIssuer}/oauth/token`,
    init: {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", client_id: clientId, code: authorizationCode, code_verifier: codeVerifier, redirect_uri: `${chatgptIssuer}/deviceauth/callback` }).toString(),
    },
  }),
  refresh: (clientId: string, refreshToken: string) =>
    ({ url: `${chatgptIssuer}/oauth/token`, init: json({ grant_type: "refresh_token", client_id: clientId, refresh_token: refreshToken }) }),
};

/** A JWT's claims, unverified: only for display and the account header, never for trust decisions. */
export function jwtClaims(token: string | undefined): Record<string, unknown> {
  try { return JSON.parse(Buffer.from(token!.split(".")[1]!, "base64url").toString("utf8")) as Record<string, unknown>; }
  catch { return {}; }
}

const text = (value: unknown) => typeof value === "string" && value ? value : null;

/** Tokens from an /oauth/token reply; a refresh may omit the refresh token (then the old one stays). */
export function parseTokens(body: unknown, previousRefresh?: string, now = new Date()): ChatgptTokens {
  const reply = (body ?? {}) as { access_token?: unknown; refresh_token?: unknown; id_token?: unknown; expires_in?: unknown };
  const accessToken = text(reply.access_token), refreshToken = text(reply.refresh_token) ?? previousRefresh ?? null;
  if (!accessToken || !refreshToken) throw new CoachModelError("ChatGPT sign-in returned no tokens.");
  const id = jwtClaims(text(reply.id_token) ?? undefined), access = jwtClaims(accessToken);
  const auth = (id["https://api.openai.com/auth"] ?? access["https://api.openai.com/auth"] ?? {}) as { chatgpt_account_id?: unknown };
  const profile = (access["https://api.openai.com/profile"] ?? {}) as { email?: unknown };
  // The token's own expiry; else expires_in; else an hour, so it is refreshed early rather than late.
  const exp = typeof access.exp === "number" ? access.exp * 1000 : typeof reply.expires_in === "number" ? now.getTime() + reply.expires_in * 1000 : now.getTime() + 3_600_000;
  return { accessToken, refreshToken, accountId: text(auth.chatgpt_account_id), email: text(id.email) ?? text(profile.email), expiresAt: new Date(exp) };
}

/** The production flow against auth.openai.com. */
export function createChatgptAuth(clientId: string, fetcher: typeof fetch = fetch): ChatgptAuth {
  const send = async ({ url, init }: { url: string; init: RequestInit }) => {
    try { return await fetcher(url, { ...init, signal: AbortSignal.timeout(20_000) }); }
    catch { throw new CoachModelError("Could not reach OpenAI."); }
  };
  const body = (response: Response) => response.json().catch(() => null) as Promise<Record<string, unknown> | null>;
  return {
    async start() {
      const response = await send(chatgptRequests.deviceCode(clientId));
      const reply = response.ok ? await body(response) : null;
      const deviceAuthId = text(reply?.device_auth_id), userCode = text(reply?.user_code) ?? text(reply?.usercode);
      if (!deviceAuthId || !userCode) throw new CoachModelError("OpenAI did not start the sign-in. Try again later.");
      const interval = Number(reply?.interval);
      return { deviceAuthId, userCode, intervalSeconds: Number.isFinite(interval) && interval >= 1 && interval <= 30 ? interval : 5 };
    },
    async poll(code) {
      const response = await send(chatgptRequests.deviceToken(code));
      // 403/404: the user has not approved yet.
      if (response.status === 403 || response.status === 404) { await response.body?.cancel(); return null; }
      const reply = response.ok ? await body(response) : null;
      const authorizationCode = text(reply?.authorization_code), verifier = text(reply?.code_verifier);
      if (!authorizationCode || !verifier) throw new ChatgptRefusedError("OpenAI ended the sign-in. Start again.");
      const exchanged = await send(chatgptRequests.exchange(clientId, authorizationCode, verifier));
      if (!exchanged.ok) { await exchanged.body?.cancel(); throw new ChatgptRefusedError("OpenAI refused the sign-in. Start again."); }
      return parseTokens(await body(exchanged));
    },
    async refresh(refreshToken) {
      const response = await send(chatgptRequests.refresh(clientId, refreshToken));
      if (response.status === 400 || response.status === 401 || response.status === 403) { await response.body?.cancel(); throw new ChatgptRefusedError("ChatGPT signed you out."); }
      if (!response.ok) { await response.body?.cancel(); throw new CoachModelError("OpenAI is unavailable. Try again later."); }
      return parseTokens(await body(response), refreshToken);
    },
  };
}
