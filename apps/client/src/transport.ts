import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Account, AccountTransport, Credentials } from "./session";
import { AccountTransportError, nativeAccountError } from "./errors";

export function browserTransport(fetcher: typeof fetch = fetch): AccountTransport {
  async function account(): Promise<Account | null> {
    const response = await fetcher("/api/v1/account", { credentials: "same-origin", cache: "no-store" });
    if (response.status === 401) return null;
    if (!response.ok) throw new AccountTransportError("ACCOUNT_UNAVAILABLE");
    return response.json();
  }
  async function authenticate(path: string, credentials: Credentials & { name?: string }) {
    const response = await fetcher(`/api/auth/${path}/email`, {
      method: "POST", credentials: "same-origin",
      headers: { "content-type": "application/json" }, body: JSON.stringify(credentials),
    });
    if (!response.ok) throw new AccountTransportError(path === "sign-in" ? "SIGN_IN_FAILED" : "REGISTRATION_FAILED");
    // The browser relies on HttpOnly cookies; never retain the response token.
    const identity = await account();
    if (!identity) throw new AccountTransportError("SESSION_UNAVAILABLE");
    return identity;
  }
  return {
    account,
    signIn: (credentials) => authenticate("sign-in", credentials),
    signUp: (credentials) => authenticate("sign-up", credentials),
    signOut: async () => {
      const response = await fetcher("/api/auth/sign-out", { method: "POST", credentials: "same-origin" });
      if (!response.ok) throw new AccountTransportError("LOGOUT_UNCONFIRMED");
    },
  };
}

export function accountTransport(): AccountTransport {
  if (!isTauri()) return browserTransport();
  const command = async <T,>(name: string, args?: Record<string, unknown>): Promise<T> => {
    try { return await invoke<T>(name, args); }
    catch (error) { throw nativeAccountError(error); }
  };
  // No credential getter and no general-purpose authenticated HTTP command.
  return {
    account: () => command<Account | null>("account"),
    signIn: (credentials) => command<Account>("sign_in", { credentials }),
    signUp: (credentials) => command<Account>("sign_up", { credentials }),
    signOut: () => command<void>("sign_out"),
  };
}
