import { expect, it } from "vitest";
import { SessionController, type Account, type AccountTransport, type GoogleTransport, type GoogleOutcome } from "./session";
import { AccountTransportError, nativeAccountError } from "./errors";
import { browserGoogle } from "./transport";

const alice: Account = { user: { id: "alice", name: "Alice", email: "alice@example.test", image: null, emailVerified: true }, expiresAt: "2026-10-16T10:00:00.000Z" };
const bob: Account = { ...alice, user: { ...alice.user, id: "bob" } };
const signedOut: AccountTransport = { account: async () => null, signIn: async () => alice, signUp: async () => alice, signOut: async () => {} };

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function google(finish: () => Promise<GoogleOutcome | null>): GoogleTransport & { started: string[]; cancelled: number } {
  const fake = { started: [] as string[], cancelled: 0, startGoogle: async (intent: string) => { fake.started.push(intent); }, finishGoogle: finish, cancelGoogle: async () => { fake.cancelled++; } };
  return fake as never;
}

it("a warm Google return signs in and clears the previous user's cache", async () => {
  const done = deferred<GoogleOutcome | null>();
  let cleared = 0;
  const session = new SessionController(signedOut, () => { cleared++; }, google(() => done.promise));
  await session.refresh();
  const flow = session.continueWithGoogle("sign-in");
  await Promise.resolve();
  expect(session.getGooglePending()).toBe(true);
  // A focus refresh while the browser is open must not override the result.
  const stale = session.refresh();
  done.resolve({ account: alice, linked: false });
  await Promise.all([flow, stale]);
  expect(session.getSnapshot()).toEqual({ status: "signed-in", account: alice, error: null });
  expect(session.getGooglePending()).toBe(false);
  expect(cleared).toBeGreaterThan(0);
});

it("a cold start completes a pending handoff without a user action", async () => {
  const session = new SessionController(signedOut, () => {}, google(async () => ({ account: alice, linked: false })));
  await Promise.all([session.refresh(), session.resumeGoogle()]);
  expect(session.getSnapshot().account?.user.id).toBe("alice");
});

it("a cold start with nothing pending leaves the session untouched", async () => {
  const session = new SessionController({ ...signedOut, account: async () => bob }, () => {}, google(async () => null));
  await Promise.all([session.refresh(), session.resumeGoogle()]);
  expect(session.getSnapshot()).toEqual({ status: "signed-in", account: bob, error: null });
});

it("user cancellation returns to the form without an error", async () => {
  const done = deferred<GoogleOutcome | null>();
  const fake = google(() => done.promise);
  fake.cancelGoogle = async () => { fake.cancelled++; done.reject(nativeAccountError("Google sign-in was cancelled.")); };
  const session = new SessionController(signedOut, () => {}, fake);
  await session.refresh();
  const flow = session.continueWithGoogle("sign-in");
  await session.cancelGoogle();
  await flow;
  expect(fake.cancelled).toBe(1);
  expect(session.getSnapshot()).toEqual({ status: "signed-out", account: null, error: null });
  expect(session.getGoogleError()).toBeNull();
  expect(session.getGooglePending()).toBe(false);
});

it("expired or rejected handoffs show recovery copy and keep the current account", async () => {
  for (const [message, expected] of [
    ["Google sign-in took too long. Try again.", "Google sign-in took too long. Try again."],
    ["That Google account is already linked to a different todalo account.", "That Google account is already linked to a different todalo account."],
    ["raw provider detail with private data", "The native account operation could not finish. Try again."],
  ]) {
    const session = new SessionController({ ...signedOut, account: async () => bob }, () => {}, google(async () => { throw nativeAccountError(message); }));
    await session.refresh();
    await session.continueWithGoogle("link");
    expect(session.getSnapshot()).toEqual({ status: "signed-in", account: bob, error: null });
    expect(session.getGoogleError()).toBe(expected);
    // A focus refresh after the return keeps the Google recovery copy.
    await session.refresh();
    expect(session.getGoogleError()).toBe(expected);
  }
});

it("linking keeps the signed-in account and its cache", async () => {
  let cleared = 0;
  const session = new SessionController({ ...signedOut, account: async () => alice }, () => { cleared++; }, google(async () => ({ account: alice, linked: true })));
  await session.refresh();
  cleared = 0;
  await session.continueWithGoogle("link");
  expect(session.getSnapshot()).toEqual({ status: "signed-in", account: alice, error: null });
  expect(cleared).toBe(0);
});

it("the browser transport starts Google with its own origin and never stores a token", async () => {
  const calls: Array<{ url: string; body: Record<string, string> }> = [];
  const fetcher = (async (url: string, init?: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init?.body)) });
    return Response.json({ url: "https://accounts.google.com/o/oauth2/v2/auth?state=s", redirect: true, token: "must-not-be-kept" });
  }) as typeof fetch;
  const assigned: string[] = [];
  const location = { origin: "http://localhost:5173", pathname: "/today", search: "", assign: (url: string) => assigned.push(url) };
  const transport = browserGoogle(fetcher, location as never, { replaceState: () => {} } as never);
  await transport.startGoogle("sign-in");
  await transport.startGoogle("link");
  expect(calls.map((call) => call.url)).toEqual(["/api/auth/sign-in/social", "/api/auth/link-social"]);
  expect(calls[0].body).toEqual({ provider: "google", callbackURL: "http://localhost:5173/today?google=signed-in", errorCallbackURL: "http://localhost:5173/today?google=failed" });
  expect(calls[1].body.callbackURL).toBe("http://localhost:5173/today?google=linked");
  expect(assigned).toEqual(["https://accounts.google.com/o/oauth2/v2/auth?state=s", "https://accounts.google.com/o/oauth2/v2/auth?state=s"]);
  expect(JSON.stringify(globalThis.localStorage ?? {})).not.toContain("must-not-be-kept");
});

it("the browser transport reports the Google result once and strips it from the URL", async () => {
  const replaced: string[] = [];
  const history = { replaceState: (_: unknown, __: string, url: string) => replaced.push(url) };
  const at = (search: string) => ({ origin: "http://localhost:5173", pathname: "/today", search, assign: () => {} });
  const fetcher = (async () => Response.json(alice)) as unknown as typeof fetch;
  await expect(browserGoogle(fetcher, at("?google=failed&error=access_denied") as never, history as never).finishGoogle()).rejects.toMatchObject({ code: "GOOGLE_CANCELLED" });
  await expect(browserGoogle(fetcher, at("?google=failed&error=account_not_linked") as never, history as never).finishGoogle()).rejects.toMatchObject({ code: "GOOGLE_NOT_LINKED" });
  expect(await browserGoogle(fetcher, at("?google=linked") as never, history as never).finishGoogle()).toEqual({ account: alice, linked: true });
  expect(await browserGoogle(fetcher, at("") as never, history as never).finishGoogle()).toBeNull();
  expect(replaced).toEqual(["/today", "/today", "/today"]);
  expect(new AccountTransportError("GOOGLE_FAILED").message).toBe("Google sign-in could not be completed. Try again.");
});
