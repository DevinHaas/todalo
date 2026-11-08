import { invoke, isTauri } from "@tauri-apps/api/core";
import { queryOptions, type QueryClient } from "@tanstack/react-query";
import type { CoachDto, CoachExplanationsDto, CoachProviderDto, CoachProviderKind } from "../../../packages/server/src/coach";
import { AccountTransportError, nativeAccountError } from "./errors";
import { localZone } from "./seasons";

export type { CoachDto, CoachProviderDto, CoachProviderKind };
export { coachProviderInfo, coachProviderKinds, ollamaDefaultUrl, ollamaUrl } from "../../../packages/server/src/coach";
/** What Connect sends; an omitted apiKey keeps the saved key for the same provider. */
export interface CoachProviderInput { provider: CoachProviderKind; model: string; baseUrl?: string; apiKey?: string }
export interface CoachTestResult { ok: boolean; message?: string }
const notConnected: CoachTestResult = { ok: false, message: "Connect an AI provider first in Settings › Coach." };

/** Goals ticket 17: the Coach's AI provider and its goal status explanations. */
export interface CoachTransport {
  get(): Promise<CoachDto>;
  save(input: CoachProviderInput): Promise<CoachDto>;
  disconnect(): Promise<CoachDto>;
  test(): Promise<CoachTestResult>;
  explanations(timeZone: string): Promise<CoachExplanationsDto>;
}

export function browserCoachTransport(fetcher: typeof fetch = fetch): CoachTransport {
  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetcher(path, {
        method, credentials: "same-origin", cache: "no-store",
        ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
      });
    } catch { throw new AccountTransportError("CONNECTION_FAILED"); }
    if (response.status === 401) throw new AccountTransportError("UNAUTHENTICATED");
    if (response.status === 400) throw new AccountTransportError("INVALID_INPUT");
    if (response.status === 404 && method === "POST") return null as T;
    if (!response.ok) throw new AccountTransportError(method === "GET" ? "TASKS_UNAVAILABLE" : "SAVE_FAILED");
    try { return await response.json() as T; }
    catch { throw new AccountTransportError("INVALID_RESPONSE"); }
  }
  return {
    get: () => request("GET", "/api/v1/coach"),
    save: (input) => request("PUT", "/api/v1/coach/provider", input),
    disconnect: () => request("DELETE", "/api/v1/coach/provider"),
    test: () => request<CoachTestResult | null>("POST", "/api/v1/coach/provider/test").then(result => result ?? notConnected),
    explanations: (timeZone) => request("GET", `/api/v1/coach/explanations?${new URLSearchParams({ timeZone })}`),
  };
}

export function coachTransport(): CoachTransport {
  if (!isTauri()) return browserCoachTransport();
  const command = async <T,>(name: string, args?: Record<string, unknown>): Promise<T> => {
    try { return await invoke<T>(name, args); }
    catch (error) { throw nativeAccountError(error); }
  };
  // Fixed native commands; Rust attaches the Keychain bearer.
  return {
    get: () => command("coach"),
    save: (provider) => command("save_coach_provider", { provider }),
    disconnect: () => command("disconnect_coach"),
    test: async () => (await command<CoachTestResult | null>("test_coach")) ?? notConnected,
    explanations: (timeZone) => command("coach_explanations", { timeZone }),
  };
}

export const coachKeys = {
  all: (userId: string) => ["user", userId, "coach"] as const,
  provider: (userId: string) => ["user", userId, "coach", "provider"] as const,
  /** `stamp` changes with the season's statuses, so a changed status asks again (the server still caches per day). */
  explanations: (userId: string, stamp: string) => ["user", userId, "coach", "explanations", stamp] as const,
};

export function coachQueries(transport: CoachTransport) {
  return {
    provider: (userId: string) => queryOptions({ queryKey: coachKeys.provider(userId), queryFn: () => transport.get() }),
    // A model call per goal at most once a day (the server caches), so a failure is not retried in a loop.
    explanations: (userId: string, stamp: string) => queryOptions({ queryKey: coachKeys.explanations(userId, stamp), queryFn: () => transport.explanations(localZone()), retry: false, staleTime: 5 * 60_000 }),
  };
}

/** Connect and disconnect wait for the server, then refetch the provider and explanations. */
export function coachMutations(transport: CoachTransport, cache: QueryClient, userId: string) {
  const settled = async <T,>(run: () => Promise<T>) => { try { return await run(); } finally { await cache.invalidateQueries({ queryKey: coachKeys.all(userId) }); } };
  return {
    save: (input: CoachProviderInput) => settled(() => transport.save(input)),
    disconnect: () => settled(() => transport.disconnect()),
    test: () => transport.test(),
  };
}
