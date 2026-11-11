import { afterEach, describe, expect, it, vi } from "vitest";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createSessionAuth } from "../../../packages/auth/src/config";
import { createAuthRoutes } from "./auth-routes";

function fixture(expiresIn = 3600, membership?: Parameters<typeof createAuthRoutes>[1]) {
  const auth = createSessionAuth({
    database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
    baseURL: "http://localhost:3000",
    secret: "ticket-two-test-secret-at-least-32-characters",
    trustedOrigins: ["http://localhost:5173"],
    session: { expiresIn },
    logger: { disabled: true },
  });
  const app = createAuthRoutes(auth, membership);
  const request = (path: string, init?: RequestInit) => app.handle(new Request(`http://localhost:3000${path}`, init));
  return { auth, request };
}

async function signIn(request: ReturnType<typeof fixture>["request"]) {
  return request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:5173" },
    body: JSON.stringify({ name: "Test User", email: "native@example.test", password: "test-password-123" }),
  });
}

afterEach(() => vi.useRealTimers());

describe("shared account authentication", () => {
  it("saves a small uploaded profile photo and refuses anything else", async () => {
    const { request } = fixture();
    const token = (await signIn(request)).headers.get("set-auth-token")!;
    const setPhoto = (image: string | null) => request("/api/auth/update-user", {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ image }),
    });
    const photo = (async () => ((await (await request("/api/v1/account", { headers: { authorization: `Bearer ${token}` } })).json()) as { user: { image: string | null } }).user.image);
    expect((await setPhoto("data:image/jpeg;base64,/9j/4AAQ")).ok).toBe(true);
    expect(await photo()).toBe("data:image/jpeg;base64,/9j/4AAQ");
    expect((await setPhoto("javascript:alert(1)")).ok).toBe(false);
    expect(await photo()).toBe("data:image/jpeg;base64,/9j/4AAQ");
    expect((await setPhoto(null)).ok).toBe(true);
    expect(await photo()).toBeNull();
  });

  it("adds the member badge to the account when membership is known", async () => {
    const { request } = fixture(3600, async () => ({ number: 42, since: "2026-06-14T00:00:00.000Z", founding: true }));
    const cookie = (await signIn(request)).headers.get("set-cookie")!.split(";")[0];
    const body = await (await request("/api/v1/account", { headers: { cookie } })).json() as { member?: unknown };
    expect(body.member).toEqual({ number: 42, since: "2026-06-14T00:00:00.000Z", founding: true });
  });

  it("preserves browser cookies and returns only safe account identity", async () => {
    const { request } = fixture();
    const login = await request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:5173" },
      body: JSON.stringify({ name: "Test User", email: "native@example.test", password: "test-password-123" }),
    });
    expect(login.status).toBe(200);
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    const account = await request("/api/v1/account", { headers: { cookie } });
    expect(account.status).toBe(200);
    expect(await account.json()).toEqual({
      user: { id: expect.any(String), name: "Test User", email: "native@example.test", image: null, emailVerified: false },
      expiresAt: expect.any(String),
    });
  });

  it("accepts a signed native bearer session and revokes it on sign-out", async () => {
    const { request } = fixture();
    const login = await signIn(request);
    const headers = { authorization: `Bearer ${login.headers.get("set-auth-token")}` };
    expect((await request("/api/v1/account", { headers })).status).toBe(200);
    expect((await request("/api/auth/sign-out", { method: "POST", headers })).status).toBe(200);
    expect((await request("/api/v1/account", { headers })).status).toBe(401);
  });

  it("an existing email/password account can sign in again after logout", async () => {
    const { request } = fixture();
    const registration = await signIn(request);
    const headers = { authorization: `Bearer ${registration.headers.get("set-auth-token")}` };
    await request("/api/auth/sign-out", { method: "POST", headers });
    const login = await request("/api/auth/sign-in/email", {
      method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:5173" },
      body: JSON.stringify({ email: "native@example.test", password: "test-password-123" }),
    });
    expect(login.status).toBe(200);
    expect((await request("/api/v1/account", { headers: { authorization: `Bearer ${login.headers.get("set-auth-token")}` } })).status).toBe(200);
  });

  it("rejects unsigned, malformed and expired bearer sessions", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { request } = fixture(1);
    const login = await signIn(request);
    const payload = await login.json() as { token: string };
    expect((await request("/api/v1/account", { headers: { authorization: `Bearer ${payload.token}` } })).status).toBe(401);
    expect((await request("/api/v1/account", { headers: { authorization: "Bearer invalid.signature" } })).status).toBe(401);
    vi.setSystemTime(new Date(Date.now() + 2000));
    expect((await request("/api/v1/account", { headers: { authorization: `Bearer ${login.headers.get("set-auth-token")}` } })).status).toBe(401);
  });

  it("rejects cookie sign-out from missing and untrusted origins without revoking the session", async () => {
    const { request } = fixture();
    const login = await signIn(request);
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    for (const headers of [new Headers({ cookie }), new Headers({ cookie, origin: "https://attacker.example" })]) {
      expect((await request("/api/auth/sign-out", { method: "POST", headers })).status).toBe(403);
    }
    expect((await request("/api/v1/account", { headers: { cookie } })).status).toBe(200);
    expect((await request("/api/auth/sign-out", { method: "POST", headers: { cookie, origin: "http://localhost:5173" } })).status).toBe(200);
    expect((await request("/api/v1/account", { headers: { cookie } })).status).toBe(401);
  });

  it("rejects a cross-site login attempt before a cookie is present", async () => {
    const { request } = fixture();
    expect((await request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://attacker.example", "sec-fetch-site": "cross-site", "sec-fetch-mode": "navigate" },
      body: JSON.stringify({ email: "native@example.test", password: "test-password-123" }),
    })).status).toBe(403);
  });
});
