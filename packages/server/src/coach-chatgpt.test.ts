import { describe, expect, it } from "vitest";
import { CoachModelError } from "./coach";
import {
  agentHostId, authorizeParams, chatgptCallbackUrl, chatgptPkce, chatgptScopes, ChatgptRefusedError, createChatgptAuth, isLoopback, parseTokens, pkceChallenge,
  readChatgptCallback, redirectKey, type ChatgptPending,
} from "./coach-chatgpt";
import { fakeOpenaiAuth } from "./coach-chatgpt.fake";

describe("PKCE and the authorize request", () => {
  it("S256 matches RFC 7636's example, and every sign-in gets fresh secrets of T3's sizes", () => {
    expect(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
    const one = chatgptPkce(), two = chatgptPkce();
    expect([one.state.length, one.nonce.length, one.verifier.length]).toEqual([43, 43, 86]);
    expect(one.challenge).toBe(pkceChallenge(one.verifier));
    expect(new Set([one.state, one.nonce, one.verifier, two.state, two.nonce, two.verifier]).size).toBe(6);
  });

  const base = { redirectUri: "http://127.0.0.1:5000/auth/callback", hostId: "urn:uuid:h", state: "s", nonce: "n", challenge: "c" };
  const common = { ext_agent_host_id: "urn:uuid:h", response_type: "code", redirect_uri: base.redirectUri, scope: chatgptScopes, resource: "https://api.openai.com/v1", state: "s", nonce: "n", code_challenge_method: "S256", code_challenge: "c" };
  it.each([
    ["first sign-in: OpenAI registers todalo", { clientId: null }, { client_id: "dynamic_agent_client", agent_name_hint: "todalo", ...common }],
    ["registered client", { clientId: "oaiapp_1" }, { client_id: "oaiapp_1", ...common }],
    ["registered, with the account and a consent prompt after sharing was refused", { clientId: "oaiapp_1", loginHint: "a@example.com", consent: true },
      { client_id: "oaiapp_1", login_hint: "a@example.com", prompt: "consent", ...common }],
  ])("%s", (_name, input, expected) => expect(Object.fromEntries(authorizeParams({ ...base, ...input }))).toEqual(expected));

  it("asks for T3's scopes exactly", () => expect(chatgptScopes).toBe("openid profile email offline_access resource.invoke chatgpt.tokens.use.direct"));
});

describe("OpenAI's redirect back", () => {
  const pending: ChatgptPending = { state: "state-1", nonce: "n", verifier: "v", redirectUri: "http://127.0.0.1:5000/auth/callback", clientId: null };
  const q = (query: string) => new URLSearchParams(query);
  const at = (address: string) => new URL(address);
  it.each([
    ["code and the newly registered client", pending, q("state=state-1&code=c1&client_id=oaiapp_9"), at("http://127.0.0.1:5000/auth/callback"), { code: "c1", clientId: "oaiapp_9" }],
    ["the callback route (no address to compare)", pending, q("state=state-1&code=c1&client_id=oaiapp_9"), null, { code: "c1", clientId: "oaiapp_9" }],
    ["a registered client without client_id in the redirect", { ...pending, clientId: "oaiapp_1" }, q("state=state-1&code=c1"), null, { code: "c1", clientId: "oaiapp_1" }],
  ])("accepts %s", (_name, sign, params, returned, expected) => expect(readChatgptCallback(params, sign, returned)).toEqual(expected));

  it.each([
    ["another port", pending, q("state=state-1&code=c&client_id=oaiapp_9"), at("http://127.0.0.1:5001/auth/callback"), "does not belong"],
    ["another path", pending, q("state=state-1&code=c&client_id=oaiapp_9"), at("http://127.0.0.1:5000/other"), "does not belong"],
    ["another state", pending, q("state=state-2&code=c&client_id=oaiapp_9"), null, "could not be verified"],
    ["no state", pending, q("code=c&client_id=oaiapp_9"), null, "could not be verified"],
    ["declined", pending, q("state=state-1&error=access_denied"), null, "You declined"],
    ["another OpenAI error", pending, q("state=state-1&error=server_error"), null, "could not complete"],
    ["no code", pending, q("state=state-1&client_id=oaiapp_9"), null, "did not finish registering"],
    ["no client", pending, q("state=state-1&code=c"), null, "did not finish registering"],
    ["a client that is not an agent app", pending, q("state=state-1&code=c&client_id=app_EMoamEEZ73f0CkXaXp7hrann"), null, "did not finish registering"],
    ["a different client than the registered one", { ...pending, clientId: "oaiapp_1" }, q("state=state-1&code=c&client_id=oaiapp_2"), null, "did not finish registering"],
  ])("refuses %s", (_name, sign, params, returned, message) => {
    expect(() => readChatgptCallback(params, sign, returned)).toThrow(ChatgptRefusedError);
    expect(() => readChatgptCallback(params, sign, returned)).toThrow(message);
  });

  it.each([
    ["http://127.0.0.1:5000/auth/callback?code=c", "http://127.0.0.1:5000/auth/callback?code=c"],
    ["  127.0.0.1:5000/auth/callback?code=c ", "http://127.0.0.1:5000/auth/callback?code=c"],
    ["", null], ["http://", null],
  ])("reads the pasted address %j", (value, expected) => expect(chatgptCallbackUrl(value)?.toString() ?? null).toBe(expected));

  it.each([
    ["http://127.0.0.1:5000/auth/callback", "http://127.0.0.1/auth/callback"],
    ["http://127.0.0.1:61000/auth/callback", "http://127.0.0.1/auth/callback"],
    ["http://localhost:5173/api/v1/coach/chatgpt/callback", "http://localhost/api/v1/coach/chatgpt/callback"],
  ])("caches the registration for %s under %s", (uri, key) => expect(redirectKey(uri)).toBe(key));

  it.each([["http://localhost:5173", true], ["http://127.0.0.1:3013", true], ["http://[::1]:80", true], ["https://app.todalo.dev", false], ["nonsense", false]])(
    "loopback origin %s: %s", (origin, expected) => expect(isLoopback(origin)).toBe(expected));

  it("gives each user a stable, distinct host ID", () => {
    expect(agentHostId("alice")).toBe(agentHostId("alice"));
    expect(agentHostId("alice")).not.toBe(agentHostId("bob"));
    expect(agentHostId("alice")).toMatch(/^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe("parseTokens", () => {
  const now = new Date("2026-11-08T00:00:00Z");
  const ok = { access_token: "a", refresh_token: "r", token_type: "Bearer", expires_in: 60, scope: "openid chatgpt.tokens.use.direct" };
  it.each([
    ["a full reply", ok, { expiresAt: new Date(now.getTime() + 60_000), earliestRefreshAt: null, scopes: ["openid", "chatgpt.tokens.use.direct"] }],
    ["earliest_refresh_at in seconds", { ...ok, earliest_refresh_at: 1_800_000_000 }, { earliestRefreshAt: new Date(1_800_000_000_000) }],
    ["earliest_refresh_at as a date", { ...ok, earliest_refresh_at: "2026-11-09T00:00:00Z" }, { earliestRefreshAt: new Date("2026-11-09T00:00:00Z") }],
  ])("%s", (_name, body, expected) => expect(parseTokens("oaiapp_1", body, "e@x", now)).toMatchObject({ clientId: "oaiapp_1", accessToken: "a", refreshToken: "r", email: "e@x", ...expected }));
  it.each([[{}], [null], [{ ...ok, refresh_token: undefined }], [{ ...ok, token_type: "mac" }], [{ ...ok, expires_in: 0 }], [{ ...ok, scope: undefined }]])(
    "refuses %o", (body) => expect(() => parseTokens("c", body, null)).toThrow(CoachModelError));
});

describe("createChatgptAuth against a fake auth.openai.com", () => {
  const signIn = async (fake = fakeOpenaiAuth(), share = true) => {
    const auth = createChatgptAuth(fake.fetch);
    const secrets = chatgptPkce();
    const redirectUri = "http://127.0.0.1:5000/auth/callback";
    const url = await auth.authorizeUrl({ clientId: null, redirectUri, hostId: agentHostId("alice"), ...secrets });
    const back = new URL(fake.approve(url, { share }));
    const { code, clientId } = readChatgptCallback(back.searchParams, { ...secrets, redirectUri, clientId: null }, back);
    return { fake, auth, secrets, redirectUri, code, clientId };
  };

  it("discovers once, registers todalo on the first sign-in and exchanges the code with the verifier", async () => {
    const { fake, auth, secrets, redirectUri, code, clientId } = await signIn();
    expect(clientId).toBe("oaiapp_1");
    const tokens = await auth.exchange({ clientId, code, verifier: secrets.verifier, redirectUri, nonce: secrets.nonce });
    expect(tokens).toMatchObject({ clientId: "oaiapp_1", email: "alice@example.com", refreshToken: "refresh-2" });
    expect(tokens.scopes).toContain("chatgpt.tokens.use.direct");
    expect(fake.seen).toEqual(["GET /.well-known/openid-configuration", "POST /api/accounts/oauth/token"]);
  });

  it("refuses a wrong verifier, a reused code and an ID token for another nonce", async () => {
    const one = await signIn();
    await expect(one.auth.exchange({ clientId: one.clientId, code: one.code, verifier: "wrong", redirectUri: one.redirectUri, nonce: one.secrets.nonce })).rejects.toThrow("expired");
    await expect(one.auth.exchange({ clientId: one.clientId, code: one.code, verifier: one.secrets.verifier, redirectUri: one.redirectUri, nonce: one.secrets.nonce })).rejects.toThrow(ChatgptRefusedError);
    const two = await signIn();
    await expect(two.auth.exchange({ clientId: two.clientId, code: two.code, verifier: two.secrets.verifier, redirectUri: two.redirectUri, nonce: "other" })).rejects.toThrow("could not be verified");
  });

  it("refreshes with rotation; a reused token or a removed client signs out; an outage does not", async () => {
    const fake = fakeOpenaiAuth();
    fake.clients.add("oaiapp_1");
    const auth = createChatgptAuth(fake.fetch);
    const first = fake.issueRefresh("oaiapp_1");
    expect((await auth.refresh("oaiapp_1", first)).refreshToken).not.toBe(first);
    await expect(auth.refresh("oaiapp_1", first)).rejects.toThrow(ChatgptRefusedError);
    const next = fake.issueRefresh("oaiapp_1");
    fake.down = true;
    const outage = auth.refresh("oaiapp_1", next);
    await expect(outage).rejects.toThrow(CoachModelError);
    await expect(outage).rejects.not.toThrow(ChatgptRefusedError);
    fake.down = false;
    fake.clients.delete("oaiapp_1");
    await expect(auth.refresh("oaiapp_1", next)).rejects.toMatchObject({ badClient: true });
  });

  it("revokes the refresh token at sign-out, quietly when OpenAI is down", async () => {
    const fake = fakeOpenaiAuth();
    const auth = createChatgptAuth(fake.fetch);
    await auth.revoke("oaiapp_1", "refresh-x");
    expect(fake.revoked).toEqual(["refresh-x"]);
    fake.down = true;
    await expect(auth.revoke("oaiapp_1", "refresh-y")).resolves.toBeUndefined();
  });

  it.each([
    ["another issuer", { issuer: "https://evil.example" }],
    ["a token endpoint elsewhere", { token_endpoint: "https://evil.example/token" }],
  ])("does not trust discovery with %s", async (_name, change) => {
    const fake = fakeOpenaiAuth();
    Object.assign(fake.discovery, change);
    await expect(createChatgptAuth(fake.fetch).authorizeUrl({ clientId: null, redirectUri: "http://127.0.0.1:1/auth/callback", hostId: "h", ...chatgptPkce() })).rejects.toThrow("Could not verify");
  });
});
