import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Account, AccountTransport, Credentials, GoogleIntent, GoogleOutcome, GoogleTransport } from "./session";
import { AccountTransportError, nativeAccountError, type AccountErrorCode } from "./errors";

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

// Better Auth's browser error codes → safe copy.
const googleErrors: Record<string, AccountErrorCode> = {
  access_denied: "GOOGLE_CANCELLED",
  account_not_linked: "GOOGLE_NOT_LINKED",
  account_already_linked_to_different_user: "GOOGLE_ALREADY_LINKED",
};

type BrowserLocation = Pick<Location, "origin" | "pathname" | "search" | "assign">;
export function browserGoogle(fetcher: typeof fetch = fetch, location: BrowserLocation = window.location, history: Pick<History, "replaceState"> = window.history): GoogleTransport {
  const back = (result: string) => `${location.origin}${location.pathname}?google=${result}`;
  return {
    // Better Auth's own social endpoints and callback; the session returns as
    // an HttpOnly cookie, so only the provider URL is read from the response.
    async startGoogle(intent: GoogleIntent) {
      const response = await fetcher(intent === "link" ? "/api/auth/link-social" : "/api/auth/sign-in/social", {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "google", callbackURL: back(intent === "link" ? "linked" : "signed-in"), errorCallbackURL: back("failed") }),
      });
      const url = response.ok ? (await response.json() as { url?: unknown }).url : null;
      if (typeof url !== "string") throw new AccountTransportError("GOOGLE_UNAVAILABLE");
      location.assign(url);
    },
    async finishGoogle() {
      const params = new URLSearchParams(location.search);
      const result = params.get("google");
      if (!result) return null;
      history.replaceState(null, "", location.pathname);
      if (result === "failed") throw new AccountTransportError(googleErrors[params.get("error") ?? ""] ?? "GOOGLE_FAILED");
      const account = await browserTransport(fetcher).account();
      if (!account) throw new AccountTransportError("GOOGLE_FAILED");
      return { account, linked: result === "linked" };
    },
    // The tab itself is the flow; navigating back from Google is the cancel.
    async cancelGoogle() {},
  };
}

export function googleTransport(): GoogleTransport {
  if (!isTauri()) return browserGoogle();
  const command = async <T,>(name: string, args?: Record<string, unknown>): Promise<T> => {
    try { return await invoke<T>(name, args); }
    catch (error) { throw nativeAccountError(error); }
  };
  // Rust opens the system browser, receives the app link and exchanges the
  // code; the webview only ever sees the resulting account identity.
  return {
    startGoogle: (intent) => command<void>("google_start", { intent }),
    finishGoogle: () => command<GoogleOutcome | null>("google_finish"),
    cancelGoogle: () => command<void>("google_cancel"),
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
