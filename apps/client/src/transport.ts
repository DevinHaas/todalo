import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Account, AccountTransport, Credentials } from "./session";

export function browserTransport(fetcher: typeof fetch = fetch): AccountTransport {
  async function account(): Promise<Account | null> {
    const response = await fetcher("/api/v1/account", { credentials: "same-origin", cache: "no-store" });
    if (response.status === 401) return null;
    if (!response.ok) throw new Error("Cannot load your account. Try again.");
    return response.json();
  }
  async function authenticate(path: string, credentials: Credentials & { name?: string }) {
    const response = await fetcher(`/api/auth/${path}/email`, {
      method: "POST", credentials: "same-origin",
      headers: { "content-type": "application/json" }, body: JSON.stringify(credentials),
    });
    if (!response.ok) throw new Error(path === "sign-in" ? "Could not sign in. Check your email and password." : "Could not create your account. Check your details or sign in if you already have an account.");
    // The browser relies on HttpOnly cookies; never retain the response token.
    const identity = await account();
    if (!identity) throw new Error("Your session could not be loaded. Try signing in again.");
    return identity;
  }
  return {
    account,
    signIn: (credentials) => authenticate("sign-in", credentials),
    signUp: (credentials) => authenticate("sign-up", credentials),
    signOut: async () => {
      const response = await fetcher("/api/auth/sign-out", { method: "POST", credentials: "same-origin" });
      if (!response.ok) throw new Error("Sign-out failed.");
    },
  };
}

export function accountTransport(): AccountTransport {
  if (!isTauri()) return browserTransport();
  const command = async <T,>(name: string, args?: Record<string, unknown>): Promise<T> => {
    try { return await invoke<T>(name, args); }
    catch (error) { throw new Error(typeof error === "string" ? error : "The native account operation could not finish. Try again."); }
  };
  // No credential getter and no general-purpose authenticated HTTP command.
  return {
    account: () => command<Account | null>("account"),
    signIn: (credentials) => command<Account>("sign_in", { credentials }),
    signUp: (credentials) => command<Account>("sign_up", { credentials }),
    signOut: () => command<void>("sign_out"),
  };
}
