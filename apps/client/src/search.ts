import { invoke, isTauri } from "@tauri-apps/api/core";
import { queryOptions } from "@tanstack/react-query";
import type { FindDto, FindItem, SearchDto } from "../../../packages/server/src/search";
import { AccountTransportError, nativeAccountError } from "./errors";
import { taskKeys } from "./tasks";

export type { FindDto, FindItem, SearchDto };
// Shared legacy rules (title-only Quick Find matching, 40 results, 200-character query).
export { matchFindItems, searchQuery } from "../../../packages/server/src/search";

export interface SearchTransport {
  search(query: string): Promise<SearchDto>;
  find(): Promise<FindDto>;
}

export function browserSearchTransport(fetcher: typeof fetch = fetch): SearchTransport {
  async function read<T>(path: string): Promise<T> {
    let response: Response;
    try { response = await fetcher(path, { credentials: "same-origin", cache: "no-store" }); }
    catch { throw new AccountTransportError("CONNECTION_FAILED"); }
    if (response.status === 401) throw new AccountTransportError("UNAUTHENTICATED");
    if (!response.ok) throw new AccountTransportError("TASKS_UNAVAILABLE");
    try { return await response.json() as T; }
    catch { throw new AccountTransportError("INVALID_RESPONSE"); }
  }
  return {
    search: (query) => read<SearchDto>(`/api/v1/search?${new URLSearchParams({ q: query })}`),
    find: () => read<FindDto>("/api/v1/find"),
  };
}

export function searchTransport(): SearchTransport {
  if (!isTauri()) return browserSearchTransport();
  const command = async <T,>(name: string, args?: Record<string, unknown>): Promise<T> => {
    try { return await invoke<T>(name, args); }
    catch (error) { throw nativeAccountError(error); }
  };
  // Fixed read-only commands; Rust encodes the query and attaches the Keychain bearer.
  return {
    search: (query) => command<SearchDto>("search_tasks", { query }),
    find: () => command<FindDto>("quick_find"),
  };
}

/** Under ["user", id, "search"]; task writes invalidate it (taskMutations settle). */
export const searchKeys = {
  all: (userId: string) => [...taskKeys.user(userId), "search"] as const,
  results: (userId: string, query: string) => [...taskKeys.user(userId), "search", "results", query] as const,
  find: (userId: string) => [...taskKeys.user(userId), "search", "find"] as const,
};

export function searchQueries(transport: SearchTransport) {
  return {
    results: (userId: string, query: string) => queryOptions({ queryKey: searchKeys.results(userId, query), queryFn: () => transport.search(query) }),
    find: (userId: string) => queryOptions({ queryKey: searchKeys.find(userId), queryFn: () => transport.find() }),
  };
}
