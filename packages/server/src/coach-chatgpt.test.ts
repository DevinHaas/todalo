import { describe, expect, it } from "vitest";
import { CoachModelError } from "./coach";
import { ChatgptRefusedError, chatgptRequests, createChatgptAuth, jwtClaims, parseTokens } from "./coach-chatgpt";

const jwt = (claims: Record<string, unknown>) => `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;
const access = jwt({ exp: 1_800_000_000, "https://api.openai.com/auth": { chatgpt_account_id: "acct-1" }, "https://api.openai.com/profile": { email: "p@example.com" } });
const code = { deviceAuthId: "dev-1", userCode: "ABCD-1234", intervalSeconds: 5 };

describe("chatgptRequests", () => {
  it.each([
    ["deviceCode", chatgptRequests.deviceCode("client-x"), "https://auth.openai.com/api/accounts/deviceauth/usercode", "application/json", { client_id: "client-x" }],
    ["deviceToken", chatgptRequests.deviceToken(code), "https://auth.openai.com/api/accounts/deviceauth/token", "application/json", { device_auth_id: "dev-1", user_code: "ABCD-1234" }],
    ["refresh", chatgptRequests.refresh("client-x", "r-1"), "https://auth.openai.com/oauth/token", "application/json", { grant_type: "refresh_token", client_id: "client-x", refresh_token: "r-1" }],
    ["exchange", chatgptRequests.exchange("client-x", "auth-code", "verifier"), "https://auth.openai.com/oauth/token", "application/x-www-form-urlencoded",
      { grant_type: "authorization_code", client_id: "client-x", code: "auth-code", code_verifier: "verifier", redirect_uri: "https://auth.openai.com/deviceauth/callback" }],
  ])("%s", (_name, request, url, type, body) => {
    expect(request.url).toBe(url);
    expect(request.init.headers).toEqual({ "content-type": type });
    const sent = type === "application/json" ? JSON.parse(request.init.body) : Object.fromEntries(new URLSearchParams(request.init.body));
    expect(sent).toEqual(body);
  });
});

describe("parseTokens", () => {
  const now = new Date("2026-11-08T00:00:00Z");
  it.each([
    ["claims from the id and access tokens", { access_token: access, refresh_token: "r", id_token: jwt({ email: "a@example.com" }) }, undefined,
      { accessToken: access, refreshToken: "r", accountId: "acct-1", email: "a@example.com", expiresAt: new Date(1_800_000_000_000) }],
    ["a refresh without a new refresh token keeps the old one", { access_token: "opaque", expires_in: 60 }, "old",
      { accessToken: "opaque", refreshToken: "old", accountId: null, email: null, expiresAt: new Date(now.getTime() + 60_000) }],
    ["no expiry at all: an hour", { access_token: "opaque", refresh_token: "r" }, undefined,
      { accessToken: "opaque", refreshToken: "r", accountId: null, email: null, expiresAt: new Date(now.getTime() + 3_600_000) }],
  ])("%s", (_name, body, previous, expected) => expect(parseTokens(body, previous, now)).toEqual(expected));
  it.each([[{}], [null], [{ access_token: "a" }]])("refuses %o", (body) => expect(() => parseTokens(body)).toThrow(CoachModelError));
  it("reads no claims from garbage", () => expect(jwtClaims("not-a-jwt")).toEqual({}));
});

describe("createChatgptAuth", () => {
  const fake = (...responses: Response[]) => {
    const seen: string[] = [];
    return { seen, fetcher: (async (url: string) => { seen.push(url); return responses.shift()!; }) as unknown as typeof fetch };
  };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  it("starts with OpenAI's code and interval (falling back to 5 s)", async () => {
    expect(await createChatgptAuth("c", fake(json({ device_auth_id: "d", user_code: "U-1", interval: "7" })).fetcher).start()).toEqual({ deviceAuthId: "d", userCode: "U-1", intervalSeconds: 7 });
    expect((await createChatgptAuth("c", fake(json({ device_auth_id: "d", usercode: "U-2", interval: 999 })).fetcher).start()).intervalSeconds).toBe(5);
    await expect(createChatgptAuth("c", fake(json({}, 500)).fetcher).start()).rejects.toThrow(CoachModelError);
  });

  it("polls: pending on 403/404, then exchanges the authorization code", async () => {
    expect(await createChatgptAuth("c", fake(new Response(null, { status: 403 })).fetcher).poll(code)).toBeNull();
    const { seen, fetcher } = fake(json({ authorization_code: "ac", code_verifier: "v" }), json({ access_token: access, refresh_token: "r" }));
    expect(await createChatgptAuth("c", fetcher).poll(code)).toMatchObject({ accessToken: access, accountId: "acct-1", email: "p@example.com" });
    expect(seen).toEqual(["https://auth.openai.com/api/accounts/deviceauth/token", "https://auth.openai.com/oauth/token"]);
    await expect(createChatgptAuth("c", fake(json({ authorization_code: "ac", code_verifier: "v" }), json({}, 400)).fetcher).poll(code)).rejects.toThrow(ChatgptRefusedError);
  });

  it("refresh: refused on 400/401, unavailable otherwise", async () => {
    expect((await createChatgptAuth("c", fake(json({ access_token: "a2" })).fetcher).refresh("r1")).refreshToken).toBe("r1");
    await expect(createChatgptAuth("c", fake(json({ error: "invalid_grant" }, 400)).fetcher).refresh("r1")).rejects.toThrow(ChatgptRefusedError);
    const outage = createChatgptAuth("c", fake(json({}, 502)).fetcher).refresh("r1");
    await expect(outage).rejects.toThrow(CoachModelError);
    await expect(outage).rejects.not.toThrow(ChatgptRefusedError);
  });
});
