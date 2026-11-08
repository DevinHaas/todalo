// Test support for goals ticket 18: an in-memory auth.openai.com that behaves
// like the real one as T3 Code uses it. approve() plays the user's browser:
// sign in, allow (or refuse) plan sharing, and get sent to the redirect.
import { createHash } from "node:crypto";
import { chatgptIssuer, chatgptResource, chatgptScopes, chatgptSharingScope } from "./coach-chatgpt";

const jwt = (claims: Record<string, unknown>) => `e30.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export function fakeOpenaiAuth() {
  const codes = new Map<string, { clientId: string; challenge: string; redirectUri: string; nonce: string; email: string; scope: string }>();
  const refreshTokens = new Map<string, { clientId: string; email: string; scope: string }>();
  let issued = 0;
  const fake = {
    /** oaiapp_* clients OpenAI registered; removing one makes the token endpoint answer invalid_client. */
    clients: new Set<string>(),
    /** Every request, as "METHOD path". */
    seen: [] as string[],
    revoked: [] as string[],
    discovery: { issuer: chatgptIssuer, authorization_endpoint: `${chatgptIssuer}/api/accounts/authorize`, token_endpoint: `${chatgptIssuer}/api/accounts/oauth/token`, revocation_endpoint: `${chatgptIssuer}/api/accounts/oauth/revoke`, jwks_uri: `${chatgptIssuer}/.well-known/jwks.json` } as Record<string, string>,
    /** "down": every call fails like an outage. */
    down: false,
    /** Plays the browser: checks the authorize request like OpenAI and returns the address it redirects to. */
    approve(authorizeUrl: string, { email = "alice@example.com", share = true, decline = false } = {}) {
      const url = new URL(authorizeUrl);
      const q = url.searchParams;
      if (url.origin + url.pathname !== fake.discovery.authorization_endpoint) throw new Error(`not the authorize endpoint: ${url.pathname}`);
      const redirect = new URL(q.get("redirect_uri")!);
      if (!["127.0.0.1", "localhost"].includes(redirect.hostname)) throw new Error("invalid_authorize_request: redirect_uri");
      if (q.get("response_type") !== "code" || q.get("code_challenge_method") !== "S256" || q.get("scope") !== chatgptScopes || q.get("resource") !== chatgptResource || !q.get("ext_agent_host_id")?.startsWith("urn:uuid:"))
        throw new Error("invalid_authorize_request");
      let clientId = q.get("client_id")!;
      if (clientId === "dynamic_agent_client") {
        if (q.get("agent_name_hint") !== "todalo") throw new Error("no agent name");
        clientId = `oaiapp_${fake.clients.size + 1}`;
        fake.clients.add(clientId);
      } else if (!fake.clients.has(clientId)) throw new Error("unknown client");
      const back = new URL(redirect);
      back.searchParams.set("state", q.get("state")!);
      if (decline) { back.searchParams.set("error", "access_denied"); return back.toString(); }
      const code = `code-${++issued}`;
      codes.set(code, { clientId, challenge: q.get("code_challenge")!, redirectUri: q.get("redirect_uri")!, nonce: q.get("nonce")!, email, scope: share ? chatgptScopes : chatgptScopes.replace(` ${chatgptSharingScope}`, "") });
      back.searchParams.set("code", code);
      back.searchParams.set("client_id", clientId);
      return back.toString();
    },
    /** A refresh token the fake knows, for refresh tests. */
    issueRefresh(clientId: string, email = "alice@example.com", scope = chatgptScopes) { const token = `refresh-${++issued}`; refreshTokens.set(token, { clientId, email, scope }); return token; },
    fetch: (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
      const method = init?.method ?? "GET";
      fake.seen.push(`${method} ${url.pathname}`);
      if (fake.down) throw new TypeError("fetch failed");
      if (url.origin !== chatgptIssuer) return json({ error: "not_found" }, 404);
      if (method === "GET" && url.pathname === "/.well-known/openid-configuration") return json(fake.discovery);
      const form = new URLSearchParams(String(init?.body ?? ""));
      if (method === "POST" && url.pathname === "/api/accounts/oauth/revoke") { fake.revoked.push(form.get("token")!); return new Response(null, { status: 200 }); }
      if (method !== "POST" || url.pathname !== "/api/accounts/oauth/token") return json({ error: "not_found" }, 404);
      if ((init?.headers as Record<string, string>)["content-type"] !== "application/x-www-form-urlencoded") return json({ error: "invalid_request" }, 400);
      const clientId = form.get("client_id")!;
      if (!fake.clients.has(clientId)) return json({ error: "invalid_client" }, 401);
      if (form.get("resource") !== chatgptResource) return json({ error: "invalid_target" }, 400);
      const issue = (email: string, scope: string, nonce?: string) => {
        const refresh = fake.issueRefresh(clientId, email, scope);
        return json({ access_token: `access-for-${refresh}`, refresh_token: refresh, token_type: "Bearer", expires_in: 3600, scope, id_token: jwt({ iss: chatgptIssuer, aud: [clientId], sub: `user-${email}`, email, ...nonce ? { nonce } : {} }) });
      };
      if (form.get("grant_type") === "authorization_code") {
        const grant = codes.get(form.get("code")!);
        codes.delete(form.get("code")!);
        const verifier = form.get("code_verifier") ?? "";
        if (!grant || grant.clientId !== clientId || grant.redirectUri !== form.get("redirect_uri") || createHash("sha256").update(verifier).digest("base64url") !== grant.challenge)
          return json({ error: "invalid_grant" }, 400);
        return issue(grant.email, grant.scope, grant.nonce);
      }
      if (form.get("grant_type") === "refresh_token") {
        const saved = refreshTokens.get(form.get("refresh_token")!);
        // Rotation: a refresh token works once.
        refreshTokens.delete(form.get("refresh_token")!);
        if (!saved || saved.clientId !== clientId) return json({ error: "refresh_token_reused" }, 400);
        return issue(saved.email, saved.scope);
      }
      return json({ error: "unsupported_grant_type" }, 400);
    }) as typeof fetch,
  };
  return fake;
}
