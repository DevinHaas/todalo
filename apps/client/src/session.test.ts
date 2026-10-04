import { expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { SessionController, type Account, type AccountTransport } from "./session";
import { nativeAccountError } from "./errors";

const account: Account = { user: { id: "alice", name: "Alice", email: "alice@example.test", image: null, emailVerified: false }, expiresAt: "2026-10-05T10:00:00.000Z" };

it("clears user data on logout and prevents an earlier account read restoring it", async () => {
  let finish!: (value: Account | null) => void;
  const transport: AccountTransport = {
    account: () => new Promise((resolve) => { finish = resolve; }),
    signIn: async () => account, signUp: async () => account, signOut: async () => {},
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
  const transport: AccountTransport = { account: async () => current, signIn: async () => account, signUp: async () => account, signOut: async () => {} };
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
    signUp: async () => account, signOut: async () => {},
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
    signIn: async () => account, signUp: async () => account, signOut: async () => {},
  };
  const session = new SessionController(transport, () => {});
  await session.refresh();
  expect(session.getSnapshot().error).toBe("Apple Keychain is unavailable. Unlock your device and try again.");
});

it("a missing native endpoint keeps its configuration recovery message", async () => {
  const transport: AccountTransport = {
    account: async () => { throw nativeAccountError("Configure the native API endpoint."); },
    signIn: async () => account, signUp: async () => account, signOut: async () => {},
  };
  const session = new SessionController(transport, () => {});
  await session.refresh();
  expect(session.getSnapshot().error).toBe("Configure the native API endpoint.");
});

it("unknown transport exceptions never become account recovery copy", async () => {
  let failure: unknown = new Error("unexpected transport detail with private data");
  const transport: AccountTransport = {
    account: async () => { throw failure; },
    signIn: async () => account, signUp: async () => account, signOut: async () => {},
  };
  const session = new SessionController(transport, () => {});
  await session.refresh();
  expect(session.getSnapshot().error).toBe("Cannot reach todalo. Check your connection and try again.");
  failure = nativeAccountError("Apple Keychain is unavailable. Unexpected private detail");
  await session.refresh();
  expect(session.getSnapshot().error).toBe("The native account operation could not finish. Try again.");
});
