import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createSessionAuth } from "../../../packages/auth/src/config";
import { createAuthRoutes } from "./auth-routes";
import { fakeGoogleConsent, fakeGoogleFetch, withFakeGoogleConsent, type FakeGoogleProfile } from "./fake-google";

const ORIGIN = "http://localhost:3000";
const APP = "app.todalo.client://oauth/callback";
const realFetch = globalThis.fetch;
beforeEach(() => { globalThis.fetch = fakeGoogleFetch(realFetch); });
afterEach(() => { globalThis.fetch = realFetch; vi.useRealTimers(); });

function fixture() {
  const auth = createSessionAuth({
    database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
    baseURL: ORIGIN,
    secret: "ticket-four-test-secret-at-least-32-characters",
    trustedOrigins: ["http://localhost:5173"],
    socialProviders: { google: { clientId: "fake-client", clientSecret: "fake-secret", accessType: "offline", prompt: "consent" } },
    logger: { disabled: true },
  });
  const app = createAuthRoutes(auth);
  const request = (path: string, init?: RequestInit) => app.handle(new Request(path.startsWith("http") ? path : `${ORIGIN}${path}`, init));
  return { auth, request };
}
type Request = ReturnType<typeof fixture>["request"];

/** One system-browser cookie jar, following only the redirects we choose to. */
function browser(request: Request) {
  const jar = new Map<string, string>();
  return {
    jar,
    async visit(url: string) {
      const response = await request(url, { headers: { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") } });
      for (const line of response.headers.getSetCookie()) {
        const [pair, ...attributes] = line.split(";");
        const [name, value] = [pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1)];
        if (!value || attributes.some((a) => /max-age=0/i.test(a))) jar.delete(name); else jar.set(name, value);
      }
      return response;
    },
  };
}

const pkce = () => {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url"), state: randomBytes(32).toString("base64url") };
};
const json = (body: unknown, headers: Record<string, string> = {}) => ({ method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const google: FakeGoogleProfile = { sub: "google-123", email: "native@example.test", name: "Google User" };

async function begin(request: Request, intent: "sign-in" | "link", headers: Record<string, string> = {}) {
  const client = pkce();
  const response = await request("/api/auth/native-oauth/begin", json({ intent, challenge: client.challenge, state: client.state }, headers));
  return { client, response, authorizeURL: response.ok ? (await response.json() as { authorizeURL: string }).authorizeURL : "" };
}

/** Runs the system-browser leg and returns the app deep link. */
async function browserLeg(request: Request, authorizeURL: string, outcome: FakeGoogleProfile | "cancel" = google) {
  const tab = browser(request);
  const toGoogle = await tab.visit(authorizeURL);
  expect(toGoogle.status).toBe(302);
  const callback = await tab.visit(fakeGoogleConsent(toGoogle.headers.get("location")!, outcome));
  expect(callback.status).toBe(302);
  const complete = await tab.visit(callback.headers.get("location")!);
  const page = await complete.clone().text();
  const deepLink = /<a id="return" href="([^"]+)"/.exec(page)?.[1].replaceAll("&amp;", "&") ?? "";
  if (deepLink) expect(page).toContain(`content="0;url=${deepLink.replaceAll("&", "&amp;")}"`);
  return { tab, complete, deepLink };
}

async function emailUser(request: Request, email = "native@example.test") {
  const response = await request("/api/auth/sign-up/email", json({ name: "Email User", email, password: "test-password-123" }, { origin: "http://localhost:5173" }));
  const token = response.headers.get("set-auth-token")!;
  return { token, id: ((await response.json()) as { user: { id: string } }).user.id };
}
const account = (request: Request, token: string) => request("/api/v1/account", { headers: { authorization: `Bearer ${token}` } });

describe("native Google handoff", () => {
  it("returns only a state-bound single-use code to the app and exchanges it for a native session", async () => {
    const { request } = fixture();
    const { client, authorizeURL } = await begin(request, "sign-in");
    expect(authorizeURL).toMatch(/^http:\/\/localhost:3000\/api\/auth\/native-oauth\/authorize\?attempt=[\w-]{43}$/);
    const { tab, deepLink } = await browserLeg(request, authorizeURL);

    const link = new URL(deepLink);
    expect(`${link.protocol}//${link.host}${link.pathname}`).toBe(APP);
    expect([...link.searchParams.keys()].sort()).toEqual(["code", "state"]);
    expect(link.searchParams.get("state")).toBe(client.state);
    // The browser keeps no session from this flow.
    expect([...tab.jar.keys()].some((name) => name.includes("session_token"))).toBe(false);

    const exchange = await request("/api/auth/native-oauth/exchange", json({ code: link.searchParams.get("code"), verifier: client.verifier }));
    expect(exchange.status).toBe(200);
    expect(await exchange.json()).toEqual({ intent: "sign-in" });
    const token = exchange.headers.get("set-auth-token")!;
    expect(token).toContain(".");
    const identity = await account(request, token);
    expect(identity.status).toBe(200);
    expect(((await identity.json()) as { user: { email: string } }).user.email).toBe("native@example.test");
    // No session or Google token ever appears in a URL the app or browser saw.
    for (const url of [authorizeURL, deepLink]) {
      expect(url).not.toContain(token.split(".")[0]);
      expect(url).not.toContain("fake-google-access");
    }
  });

  it("never silently attaches Google to an unverified existing email account", async () => {
    const { request, auth } = fixture();
    const existing = await emailUser(request);
    const { client, authorizeURL } = await begin(request, "sign-in");
    const { deepLink } = await browserLeg(request, authorizeURL);
    expect(Object.fromEntries(new URL(deepLink).searchParams)).toEqual({ state: client.state, error: "not_linked" });
    const accounts = await (await auth.$context).internalAdapter.findAccounts(existing.id);
    expect(accounts.map((item) => item.providerId)).toEqual(["credential"]);
    expect((await account(request, existing.token)).status).toBe(200);
  });

  it("signs a verified existing email account in with Google without creating a second account", async () => {
    const { request, auth } = fixture();
    const existing = await emailUser(request);
    await (await auth.$context).internalAdapter.updateUser(existing.id, { emailVerified: true });
    const { client, authorizeURL } = await begin(request, "sign-in");
    const { deepLink } = await browserLeg(request, authorizeURL);
    const exchange = await request("/api/auth/native-oauth/exchange", json({ code: new URL(deepLink).searchParams.get("code"), verifier: client.verifier }));
    const identity = await (await account(request, exchange.headers.get("set-auth-token")!)).json() as { user: { id: string } };
    expect(identity.user.id).toBe(existing.id);
    const accounts = await (await auth.$context).internalAdapter.findAccounts(existing.id);
    expect(accounts.map((item) => item.providerId).sort()).toEqual(["credential", "google"]);
    expect((await account(request, existing.token)).status).toBe(200);
  });

  it("rejects code replay, a wrong verifier, and reuse of browser links", async () => {
    const { request } = fixture();
    const first = await begin(request, "sign-in");
    const { deepLink, complete } = await browserLeg(request, first.authorizeURL);
    const code = new URL(deepLink).searchParams.get("code");
    const wrong = pkce().verifier;
    expect((await request("/api/auth/native-oauth/exchange", json({ code, verifier: wrong }))).status).toBe(400);
    // A failed attempt burns the code; the right verifier cannot use it afterwards.
    expect((await request("/api/auth/native-oauth/exchange", json({ code, verifier: first.client.verifier }))).status).toBe(400);
    expect((await request(first.authorizeURL)).status).toBe(400);
    expect(complete.status).toBe(200);
    expect(complete.headers.get("cache-control")).toBe("no-store");
    expect(complete.headers.get("referrer-policy")).toBe("no-referrer");

    const second = await begin(request, "sign-in");
    const leg = await browserLeg(request, second.authorizeURL);
    const secondCode = new URL(leg.deepLink).searchParams.get("code");
    expect((await request("/api/auth/native-oauth/exchange", json({ code: secondCode, verifier: second.client.verifier }))).status).toBe(200);
    expect((await request("/api/auth/native-oauth/exchange", json({ code: secondCode, verifier: second.client.verifier }))).status).toBe(400);
  });

  it("expires unused browser links and unexchanged codes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { request } = fixture();
    const stale = await begin(request, "sign-in");
    vi.setSystemTime(Date.now() + 10 * 60_000 + 1000);
    expect((await request(stale.authorizeURL)).status).toBe(400);

    const fresh = await begin(request, "sign-in");
    const { deepLink } = await browserLeg(request, fresh.authorizeURL);
    vi.setSystemTime(Date.now() + 2 * 60_000 + 1000);
    expect((await request("/api/auth/native-oauth/exchange", json({ code: new URL(deepLink).searchParams.get("code"), verifier: fresh.client.verifier }))).status).toBe(400);
  });

  it("returns cancellation to the app as a safe code with no handoff", async () => {
    const { request } = fixture();
    const { client, authorizeURL } = await begin(request, "sign-in");
    const { deepLink } = await browserLeg(request, authorizeURL, "cancel");
    const link = new URL(deepLink);
    expect(Object.fromEntries(link.searchParams)).toEqual({ state: client.state, error: "cancelled" });
  });

  it("links Google to the signed-in native account and keeps its session", async () => {
    const { request, auth } = fixture();
    const user = await emailUser(request, "person@example.test");
    expect((await begin(request, "link")).response.status).toBe(401);
    const { client, authorizeURL } = await begin(request, "link", { authorization: `Bearer ${user.token}` });
    const { deepLink } = await browserLeg(request, authorizeURL, { ...google, email: "different@gmail.example" });
    const exchange = await request("/api/auth/native-oauth/exchange", json({ code: new URL(deepLink).searchParams.get("code"), verifier: client.verifier }));
    expect(await exchange.json()).toEqual({ intent: "link" });
    expect(exchange.headers.get("set-auth-token")).toBeNull();
    const accounts = await (await auth.$context).internalAdapter.findAccounts(user.id);
    expect(accounts.map((item) => item.providerId).sort()).toEqual(["credential", "google"]);
    expect((await account(request, user.token)).status).toBe(200);
  });

  it("refuses to link a Google account that belongs to another user", async () => {
    const { request } = fixture();
    const owner = await begin(request, "sign-in");
    await browserLeg(request, owner.authorizeURL);
    const other = await emailUser(request, "other@example.test");
    const { client, authorizeURL } = await begin(request, "link", { authorization: `Bearer ${other.token}` });
    const { deepLink } = await browserLeg(request, authorizeURL);
    expect(Object.fromEntries(new URL(deepLink).searchParams)).toEqual({ state: client.state, error: "already_linked" });
  });

  it("does not let cookie sessions start a link", async () => {
    const { request } = fixture();
    const signup = await request("/api/auth/sign-up/email", json({ name: "Cookie", email: "cookie@example.test", password: "test-password-123" }, { origin: "http://localhost:5173" }));
    const cookie = signup.headers.get("set-cookie")!.split(";")[0];
    expect((await begin(request, "link", { cookie, origin: "http://localhost:5173" })).response.status).toBe(401);
  });

  it("QA consent wrapper never lets a browser reach the real Google", async () => {
    const { request } = fixture();
    const handle = withFakeGoogleConsent(async (incoming) => request(incoming.url, { method: incoming.method, headers: incoming.headers, body: incoming.method === "GET" ? undefined : await incoming.text() }));
    const start = await handle(new Request(`${ORIGIN}/api/auth/sign-in/social`, json({ provider: "google", callbackURL: "/today" }, { origin: "http://localhost:5173" })));
    expect(start.headers.get("location")).toMatch(/^\/api\/fake-google\/authorize\?/);
    expect(((await start.json()) as { url: string }).url).toMatch(/^\/api\/fake-google\/authorize\?/);
    const { authorizeURL } = await begin(request, "sign-in");
    expect((await handle(new Request(authorizeURL))).headers.get("location")).toMatch(/^\/api\/fake-google\/authorize\?/);
  });

  it("keeps the legacy web Google sign-in and callback working", async () => {
    const { request } = fixture();
    const tab = browser(request);
    const start = await request("/api/auth/sign-in/social", json({ provider: "google", callbackURL: "/today" }, { origin: "http://localhost:5173" }));
    expect(start.status).toBe(200);
    for (const line of start.headers.getSetCookie()) { const pair = line.split(";")[0]; tab.jar.set(pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1)); }
    const { url } = await start.json() as { url: string };
    expect(new URL(url).searchParams.get("redirect_uri")).toBe(`${ORIGIN}/api/auth/callback/google`);
    const callback = await tab.visit(fakeGoogleConsent(url, google));
    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toBe("/today");
    const cookie = [...tab.jar].map(([k, v]) => `${k}=${v}`).join("; ");
    expect((await request("/api/v1/account", { headers: { cookie } })).status).toBe(200);
  });
});
