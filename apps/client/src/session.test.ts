import { expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { rememberedAccount, SessionController, type Account, type AccountTransport } from "./session";
import { AccountTransportError, nativeAccountError } from "./errors";
import { browserTransport } from "./transport";

const account: Account = { user: { id: "alice", name: "Alice", email: "alice@example.test", image: null, emailVerified: false }, expiresAt: "2026-10-05T10:00:00.000Z" };

it("clears user data on logout and prevents an earlier account read restoring it", async () => {
  let finish!: (value: Account | null) => void;
  const transport: AccountTransport = {
    account: () => new Promise((resolve) => { finish = resolve; }),
    signIn: async () => account, signUp: async () => account, signOut: async () => {}, deleteAccount: async () => {},
  };
  const cached = new Map([["private-task", "Alice's task"]]);
  const session = new SessionController(transport, () => cached.clear());
  const initialRead = session.refresh();
  await session.signOut();
  finish(account);
  await initialRead;
  expect(session.getSnapshot()).toEqual({ status: "signed-out", account: null, error: null });
  expect(cached.size).toBe(0);
});

it("clears queries after remote session expiry and when switching accounts", async () => {
  let current: Account | null = account;
  const transport: AccountTransport = { account: async () => current, signIn: async () => account, signUp: async () => account, signOut: async () => {}, deleteAccount: async () => {} };
  const queries = new QueryClient();
  const session = new SessionController(transport, () => queries.clear());
  await session.refresh();
  queries.setQueryData(["tasks", "alice"], ["private"]);
  current = null;
  await session.refresh();
  expect(queries.getQueryData(["tasks", "alice"])).toBeUndefined();
  expect(session.getSnapshot().status).toBe("signed-out");
  current = account;
  await session.refresh();
  queries.setQueryData(["tasks", "alice"], ["private"]);
  current = { ...account, user: { ...account.user, id: "bob" } };
  await session.refresh();
  expect(queries.getQueryData(["tasks", "alice"])).toBeUndefined();
  expect(session.getSnapshot().account?.user.id).toBe("bob");
});

it("keeps logout retryable when server revocation fails", async () => {
  let offline = true;
  const transport: AccountTransport = {
    account: async () => account, signIn: async () => account, signUp: async () => account,
    signOut: async () => { if (offline) throw new Error("offline"); },
    deleteAccount: async () => {},
  };
  const session = new SessionController(transport, () => {});
  await session.refresh();
  await session.signOut();
  expect(session.getSnapshot().error).toContain("Try again to revoke");
  offline = false;
  await session.signOut();
  expect(session.getSnapshot().status).toBe("signed-out");
});

it("a foreground refresh cannot discard an in-flight successful sign-in", async () => {
  let finish!: (value: Account) => void;
  const transport: AccountTransport = {
    account: async () => null, signIn: () => new Promise((resolve) => { finish = resolve; }),
    signUp: async () => account, signOut: async () => {}, deleteAccount: async () => {},
  };
  const session = new SessionController(transport, () => {});
  await session.refresh();
  const signIn = session.authenticate("signIn", { name: "", email: "alice@example.test", password: "test-password" });
  await session.refresh();
  finish(account);
  await signIn;
  expect(session.getSnapshot().account?.user.id).toBe("alice");
});

it("a Keychain-denied account refresh tells the user to unlock the device", async () => {
  const transport: AccountTransport = {
    account: async () => { throw nativeAccountError("Apple Keychain is unavailable. Unlock your device and try again."); },
    signIn: async () => account, signUp: async () => account, signOut: async () => {}, deleteAccount: async () => {},
  };
  const session = new SessionController(transport, () => {});
  await session.refresh();
  expect(session.getSnapshot().error).toBe("Apple Keychain is unavailable. Unlock your device and try again.");
});

it("a missing native endpoint keeps its configuration recovery message", async () => {
  const transport: AccountTransport = {
    account: async () => { throw nativeAccountError("Configure the native API endpoint."); },
    signIn: async () => account, signUp: async () => account, signOut: async () => {}, deleteAccount: async () => {},
  };
  const session = new SessionController(transport, () => {});
  await session.refresh();
  expect(session.getSnapshot().error).toBe("Configure the native API endpoint.");
});

it("unknown transport exceptions never become account recovery copy", async () => {
  let failure: unknown = new Error("unexpected transport detail with private data");
  const transport: AccountTransport = {
    account: async () => { throw failure; },
    signIn: async () => account, signUp: async () => account, signOut: async () => {}, deleteAccount: async () => {},
  };
  const session = new SessionController(transport, () => {});
  await session.refresh();
  expect(session.getSnapshot().error).toBe("Cannot reach todalo. Check your connection and try again.");
  failure = nativeAccountError("Apple Keychain is unavailable. Unexpected private detail");
  await session.refresh();
  expect(session.getSnapshot().error).toBe("The native account operation could not finish. Try again.");
});

it("a refresh that cannot reach the server keeps the signed-in screens, cache and drafts", async () => {
  let failure: unknown = null;
  const transport: AccountTransport = {
    account: async () => { if (failure) throw failure; return account; },
    signIn: async () => account, signUp: async () => account, signOut: async () => {}, deleteAccount: async () => {},
  };
  const queries = new QueryClient();
  const session = new SessionController(transport, () => queries.clear());
  await session.refresh();
  queries.setQueryData(["tasks", "alice"], ["private"]);
  for (failure of [nativeAccountError("Cannot reach todalo. Check your connection and try again."), new AccountTransportError("ACCOUNT_UNAVAILABLE")]) {
    await session.refresh();
    expect(session.getSnapshot()).toEqual({ status: "signed-in", account, error: null });
    expect(queries.getQueryData(["tasks", "alice"])).toEqual(["private"]);
  }
  // Any other failure still signs the UI out of an account it cannot confirm.
  failure = nativeAccountError("The saved credential is invalid. Sign out and try again.");
  await session.refresh();
  expect(session.getSnapshot().status).toBe("error");
  expect(queries.getQueryData(["tasks", "alice"])).toBeUndefined();
});

it("the browser account read reports a lost connection as CONNECTION_FAILED", async () => {
  await expect(browserTransport(async () => { throw new TypeError("Failed to fetch"); }).account()).rejects.toMatchObject({ code: "CONNECTION_FAILED" });
});

it("deleting the account signs out and clears data; a refusal keeps the session and says why", async () => {
  let refuse = true;
  const transport: AccountTransport = {
    account: async () => account, signIn: async () => account, signUp: async () => account, signOut: async () => {},
    deleteAccount: async () => { if (refuse) throw new AccountTransportError("DELETE_PASSWORD_INVALID"); },
  };
  const cached = new Map<string, string>();
  const session = new SessionController(transport, () => cached.clear());
  await session.refresh();
  cached.set("private-task", "Alice's task");
  expect(await session.deleteAccount("wrong")).toBe("That password is not right. Try again.");
  expect(session.getSnapshot().status).toBe("signed-in");
  expect(cached.size).toBe(1);
  refuse = false;
  expect(await session.deleteAccount("right")).toBeNull();
  expect(session.getSnapshot()).toEqual({ status: "signed-out", account: null, error: null });
  expect(cached.size).toBe(0);
});

it("maps the browser's delete-user refusals to safe copy and sends the password only when given", async () => {
  const bodies: unknown[] = [];
  const reply = (status: number, body: unknown) => async (_: RequestInfo | URL, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body))); return new Response(JSON.stringify(body), { status });
  };
  await expect(browserTransport(reply(400, { code: "SESSION_EXPIRED" }) as typeof fetch).deleteAccount()).rejects.toMatchObject({ code: "DELETE_SIGN_IN_AGAIN" });
  await expect(browserTransport(reply(400, { code: "INVALID_PASSWORD" }) as typeof fetch).deleteAccount("x")).rejects.toMatchObject({ code: "DELETE_PASSWORD_INVALID" });
  await expect(browserTransport(reply(400, { code: "<b>odd</b>" }) as typeof fetch).deleteAccount("x")).rejects.toMatchObject({ code: "DELETE_FAILED" });
  await expect(browserTransport(reply(200, { success: true }) as typeof fetch).deleteAccount("x")).resolves.toBeUndefined();
  expect(bodies).toEqual([{}, { password: "x" }, { password: "x" }, { password: "x" }]);
});

it("recognises the native delete messages exactly", () => {
  expect(nativeAccountError("For your safety, enter your password. Signed in with Google? Log out, sign in again, then delete within a day.").code).toBe("DELETE_SIGN_IN_AGAIN");
  expect(nativeAccountError("This account has no password. Leave the field empty, or log out and sign in with Google again first.").code).toBe("DELETE_NO_PASSWORD");
});

it("opens signed in as the remembered account, then follows the server (signed out forgets it)", async () => {
  const store = new Map<string, string>();
  const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => { store.set(key, value); }, removeItem: (key: string) => { store.delete(key); } };
  let current: Account | null = account;
  const transport: AccountTransport = { account: async () => current, signIn: async () => account, signUp: async () => account, signOut: async () => {}, deleteAccount: async () => {} };
  const now = new Date("2026-10-01T00:00:00.000Z").getTime();
  // Nothing remembered: the usual loading state until the server answers, which is remembered.
  const first = new SessionController(transport, () => {}, undefined, rememberedAccount(storage), now);
  expect(first.getSnapshot().status).toBe("loading");
  await first.refresh();
  expect(rememberedAccount(storage).load()).toEqual(account);
  // Next launch: signed in at once, without clearing the cache when the server agrees.
  let cleared = 0;
  const next = new SessionController(transport, () => { cleared++; }, undefined, rememberedAccount(storage), now);
  expect(next.getSnapshot()).toEqual({ status: "signed-in", account, error: null });
  await next.refresh();
  expect(cleared).toBe(0);
  // The session ended elsewhere: signed out, cache cleared, nothing remembered.
  current = null;
  await next.refresh();
  expect(next.getSnapshot().status).toBe("signed-out");
  expect(cleared).toBe(1);
  expect(rememberedAccount(storage).load()).toBeNull();
  // An expired remembered session is not used.
  rememberedAccount(storage).save(account);
  expect(new SessionController(transport, () => {}, undefined, rememberedAccount(storage), new Date("2026-11-01").getTime()).getSnapshot().status).toBe("loading");
});

it("serves focus and visibilitychange with one account read, and an unchanged answer notifies nobody", async () => {
  let reads = 0;
  const transport: AccountTransport = { account: async () => { reads += 1; return { ...account, user: { ...account.user } }; }, signIn: async () => account, signUp: async () => account, signOut: async () => {}, deleteAccount: async () => {} };
  const session = new SessionController(transport, () => {});
  await session.refresh();
  const before = session.getSnapshot();
  let notified = 0;
  session.subscribe(() => { notified += 1; });
  await Promise.all([session.refresh(), session.refresh()]);
  expect(reads).toBe(2);
  expect(notified).toBe(0);
  expect(session.getSnapshot()).toBe(before);
});
