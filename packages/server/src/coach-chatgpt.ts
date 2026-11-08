// Goals ticket 18: ChatGPT sign-in for the Coach (ADR 0007), the way T3 Code
// connects a ChatGPT plan (pingdotgg/t3code, apps/server/src/provider/CodexChatGptAuth.ts):
// OIDC discovery on auth.openai.com, PKCE authorization code with a loopback
// redirect, and OpenAI's dynamic registration for agent apps. The first sign-in
// sends client_id "dynamic_agent_client" with agent_name_hint "todalo"; OpenAI
// registers a client for todalo and returns its oaiapp_* ID with the code. That
// ID is cached per user and redirect (coach_chatgpt_clients) and reused.
// The token is for the public API (resource https://api.openai.com/v1) and
// needs the scope chatgpt.tokens.use.direct, which the user grants by allowing
// "sharing of your ChatGPT plan" on OpenAI's consent page.
import { createHash, randomBytes, randomInt } from "node:crypto";
import { CoachModelError } from "./coach";

export const chatgptIssuer = "https://auth.openai.com";
export const chatgptResource = "https://api.openai.com/v1";
/** Without this scope the token cannot run models on the user's plan. */
export const chatgptSharingScope = "chatgpt.tokens.use.direct";
/** T3 Code's scopes, unchanged. */
export const chatgptScopes = `openid profile email offline_access resource.invoke ${chatgptSharingScope}`;

/** Tokens after sign-in or refresh. clientId is the oaiapp_* client they belong to (refresh needs it). */
export interface ChatgptTokens {
  clientId: string; accessToken: string; refreshToken: string; email: string | null;
  expiresAt: Date; earliestRefreshAt: Date | null; scopes: string[];
}
/** A cached registration: OpenAI's client for this user and redirect, and what the last sign-in granted. */
export interface ChatgptClient { clientId: string; email: string | null; sharing: boolean }
/** A sign-in in progress. Server-side only: the verifier never leaves the server. */
export interface ChatgptPending { state: string; nonce: string; verifier: string; redirectUri: string; clientId: string | null }

export interface AuthorizeInput { clientId: string | null; redirectUri: string; hostId: string; state: string; nonce: string; challenge: string; loginHint?: string | null; consent?: boolean }

/** The calls to auth.openai.com; tests run the real one against a fake auth server. */
export interface ChatgptAuth {
  authorizeUrl(input: AuthorizeInput): Promise<string>;
  /** Code for tokens; checks the ID token's issuer, audience and nonce. */
  exchange(input: { clientId: string; code: string; verifier: string; redirectUri: string; nonce: string }): Promise<ChatgptTokens>;
  /** Throws ChatgptRefusedError when OpenAI refuses for good (signed out, revoked). */
  refresh(clientId: string, refreshToken: string): Promise<ChatgptTokens>;
  /** Best effort: never throws. */
  revoke(clientId: string, refreshToken: string): Promise<void>;
}

/** OpenAI refused for good: the user has to sign in again. badClient: OpenAI no longer knows the registered client. */
export class ChatgptRefusedError extends Error {
  constructor(message: string, readonly badClient = false) { super(message); }
}

const token = (bytes: number) => randomBytes(bytes).toString("base64url");
/** A fresh state, nonce and PKCE verifier with its S256 challenge (T3's sizes). */
export function chatgptPkce() {
  const verifier = token(64);
  return { state: token(32), nonce: token(32), verifier, challenge: pkceChallenge(verifier) };
}
export const pkceChallenge = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

/** The Mac app's loopback redirect (and the paste fallback's). */
export const loopbackRedirect = (port: number) => `http://127.0.0.1:${port}/auth/callback`;
/** A port for the paste fallback, where nothing listens (T3's range). */
export const pastePort = () => randomInt(49_152, 65_536);
const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
/** OpenAI accepts only loopback redirects for agent apps (checked live, 8 Nov 2026: other hosts get invalid_authorize_request). */
export const isLoopback = (origin: string) => { try { return loopbackHosts.has(new URL(origin).hostname); } catch { return false; } };
/** A registration is reused across ports (RFC 8252: loopback ports may vary), so it is cached by the redirect without its port. */
export function redirectKey(redirectUri: string) { const url = new URL(redirectUri); url.port = ""; return url.toString(); }
/** ext_agent_host_id: a stable, opaque ID per todalo user (T3 sends its install's ID). */
export function agentHostId(userId: string) {
  const hex = createHash("sha256").update(`todalo-coach-host:${userId}`).digest("hex");
  return `urn:uuid:${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${"89ab"[parseInt(hex[16]!, 16) % 4]}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** The authorize query, as T3 sends it. Pure, so it is table-tested. */
export function authorizeParams(input: AuthorizeInput) {
  return new URLSearchParams({
    client_id: input.clientId ?? "dynamic_agent_client",
    ...input.clientId
      ? { ...input.loginHint ? { login_hint: input.loginHint } : {}, ...input.consent ? { prompt: "consent" } : {} }
      : { agent_name_hint: "todalo" },
    ext_agent_host_id: input.hostId,
    response_type: "code",
    redirect_uri: input.redirectUri,
    scope: chatgptScopes,
    resource: chatgptResource,
    state: input.state,
    nonce: input.nonce,
    code_challenge_method: "S256",
    code_challenge: input.challenge,
  });
}

/** A pasted address; browsers may hide its "http://". Null when it is not a URL. */
export function chatgptCallbackUrl(value: string): URL | null {
  const text = value.trim();
  if (!text || text.length > 16_384) return null;
  try { return new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(text) ? text : `http://${text}`); } catch { return null; }
}

/**
 * The code and client from OpenAI's redirect, checked against the sign-in it
 * belongs to: same redirect (when `returnedTo` is known), same state, and an
 * oaiapp_* client that matches the registered one. Throws ChatgptRefusedError.
 */
export function readChatgptCallback(params: URLSearchParams, pending: ChatgptPending, returnedTo: URL | null) {
  const expected = new URL(pending.redirectUri);
  if (returnedTo && (returnedTo.origin !== expected.origin || returnedTo.pathname !== expected.pathname))
    throw new ChatgptRefusedError("That address does not belong to this sign-in. Start again.");
  if (params.get("state") !== pending.state) throw new ChatgptRefusedError("The sign-in could not be verified. Start again.");
  const error = params.get("error");
  if (error) throw new ChatgptRefusedError(error === "access_denied" ? "You declined the sign-in at OpenAI. Sign in again when you are ready." : "OpenAI could not complete the sign-in. Start again.");
  const code = params.get("code"), returned = params.get("client_id");
  const clientId = pending.clientId ?? returned;
  if (!code || !clientId || !/^oaiapp_[\w-]+$/.test(clientId) || (pending.clientId && returned && returned !== pending.clientId))
    throw new ChatgptRefusedError("OpenAI did not finish registering todalo. Start the sign-in again.");
  return { code, clientId };
}

/** A JWT's claims, unverified (see exchange for why that is enough here). */
export function jwtClaims(jwt: string | undefined): Record<string, unknown> {
  try { return JSON.parse(Buffer.from(jwt!.split(".")[1]!, "base64url").toString("utf8")) as Record<string, unknown>; }
  catch { return {}; }
}

const text = (value: unknown) => typeof value === "string" && value ? value : null;

/** Tokens from a token endpoint reply (T3's TokenResponse). */
export function parseTokens(clientId: string, body: unknown, email: string | null, now = new Date()): ChatgptTokens {
  const reply = (body ?? {}) as Record<string, unknown>;
  const accessToken = text(reply.access_token), refreshToken = text(reply.refresh_token), scope = typeof reply.scope === "string" ? reply.scope : null;
  const expiresIn = typeof reply.expires_in === "number" && reply.expires_in > 0 ? reply.expires_in : null;
  if (!accessToken || !refreshToken || !expiresIn || scope === null || String(reply.token_type).toLowerCase() !== "bearer")
    throw new CoachModelError("OpenAI returned an invalid sign-in. Sign in again.");
  const earliest = typeof reply.earliest_refresh_at === "number" ? reply.earliest_refresh_at * 1000 : typeof reply.earliest_refresh_at === "string" ? Date.parse(reply.earliest_refresh_at) : NaN;
  return {
    clientId, accessToken, refreshToken, email, expiresAt: new Date(now.getTime() + expiresIn * 1000),
    earliestRefreshAt: Number.isFinite(earliest) ? new Date(earliest) : null, scopes: scope.split(/\s+/).filter(Boolean),
  };
}

/** Refresh errors that mean the sign-in is over (T3's list). */
const signedOut = new Set(["invalid_grant", "invalid_refresh_token", "token_expired", "refresh_token_expired", "refresh_token_invalidated", "refresh_token_reused"]);

interface Discovery { issuer: string; authorization_endpoint: string; token_endpoint: string; revocation_endpoint?: string }

/** The production flow against auth.openai.com. */
export function createChatgptAuth(fetcher: typeof fetch = fetch, now = () => new Date()): ChatgptAuth {
  const send = async (url: string, init?: RequestInit) => {
    try { return await fetcher(url, { ...init, signal: AbortSignal.timeout(20_000) }); }
    catch { throw new CoachModelError("Could not reach OpenAI. Try again."); }
  };
  let discovery: Discovery | undefined;
  async function discover() {
    if (discovery) return discovery;
    const response = await send(`${chatgptIssuer}/.well-known/openid-configuration`);
    const found = (response.ok ? await response.json().catch(() => null) : null) as Discovery | null;
    // Like T3: every endpoint must be on the issuer itself.
    const endpoints = [found?.authorization_endpoint, found?.token_endpoint, ...found?.revocation_endpoint ? [found.revocation_endpoint] : []];
    if (found?.issuer !== chatgptIssuer || !endpoints.every(url => { try { return new URL(url!).origin === chatgptIssuer; } catch { return false; } }))
      throw new CoachModelError("Could not verify OpenAI's sign-in. Try again later.");
    return discovery = found;
  }
  async function tokenCall(body: URLSearchParams) {
    const response = await send((await discover()).token_endpoint, {
      method: "POST", headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" }, body: body.toString(),
    });
    const reply = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (response.ok) return reply;
    const error = text(reply?.error) ?? "";
    if (error === "invalid_client") throw new ChatgptRefusedError("OpenAI no longer accepts todalo's registration. Sign in again.", true);
    if (body.get("grant_type") === "refresh_token" && signedOut.has(error)) throw new ChatgptRefusedError("ChatGPT signed you out. Sign in again.");
    if (body.get("grant_type") === "authorization_code" && (error === "invalid_grant" || error === "access_denied"))
      throw new ChatgptRefusedError(error === "access_denied" ? "You declined the sign-in at OpenAI." : "The sign-in code expired. Start again.");
    throw new CoachModelError("OpenAI is unavailable. Try again later.");
  }
  return {
    async authorizeUrl(input) {
      const url = new URL((await discover()).authorization_endpoint);
      url.search = authorizeParams(input).toString();
      return url.toString();
    },
    async exchange({ clientId, code, verifier, redirectUri, nonce }) {
      const reply = await tokenCall(new URLSearchParams({ grant_type: "authorization_code", client_id: clientId, code, code_verifier: verifier, redirect_uri: redirectUri, resource: chatgptResource }));
      // ponytail: the ID token comes straight from the token endpoint over TLS, so
      // its claims are checked without a JWKS signature check (OIDC Core 3.1.3.7).
      // T3 also verifies the signature; add that if the token ever arrives another way.
      const claims = jwtClaims(text(reply?.id_token) ?? undefined);
      const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
      if (claims.iss !== chatgptIssuer || !audience.includes(clientId) || claims.nonce !== nonce || !text(claims.sub))
        throw new ChatgptRefusedError("OpenAI's sign-in could not be verified. Start again.");
      return parseTokens(clientId, reply, text(claims.email), now());
    },
    async refresh(clientId, refreshToken) {
      const reply = await tokenCall(new URLSearchParams({ grant_type: "refresh_token", client_id: clientId, refresh_token: refreshToken, resource: chatgptResource }));
      const claims = jwtClaims(text(reply?.id_token) ?? undefined);
      return parseTokens(clientId, reply, text(claims.email), now());
    },
    async revoke(clientId, refreshToken) {
      try {
        const endpoint = (await discover()).revocation_endpoint;
        if (!endpoint) return;
        const response = await send(endpoint, {
          method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: refreshToken, token_type_hint: "refresh_token", client_id: clientId }).toString(),
        });
        await response.body?.cancel();
      } catch { /* the tokens are deleted either way */ }
    },
  };
}
