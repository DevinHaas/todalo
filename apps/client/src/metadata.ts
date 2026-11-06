import { invoke, isTauri } from "@tauri-apps/api/core";
import { queryOptions, type QueryClient } from "@tanstack/react-query";
import type {
  FilterDefinition, FilterDetailDto, LabelDetailDto, LabelDto, MetadataDto, SavedFilterDto,
} from "../../../packages/server/src/metadata-input";
import { AccountTransportError, nativeAccountError } from "./errors";
import { taskKeys } from "./tasks";

export type { FilterDefinition, FilterDetailDto, LabelDetailDto, LabelDto, MetadataDto, SavedFilterDto };
export interface LabelFields { name: string; color: string | null }
export interface FilterFields { name: string; definition: FilterDefinition }
/** The legacy blank filter form (filterDefinitionSchema.parse({})). */
export const blankDefinition = (): FilterDefinition => ({ status: "open", due: "any" });

export interface MetadataTransport {
  metadata(): Promise<MetadataDto>;
  /** null when the label is missing (deleted) or not the signed-in user's. */
  label(id: string): Promise<LabelDetailDto | null>;
  filter(id: string): Promise<FilterDetailDto | null>;
  /** `id` is the client-generated operation ID: a retry returns the original. */
  createLabel(id: string, label: LabelFields): Promise<LabelDto>;
  updateLabel(id: string, label: LabelFields): Promise<LabelDto | null>;
  removeLabel(id: string): Promise<boolean>;
  createFilter(id: string, filter: FilterFields): Promise<SavedFilterDto>;
  updateFilter(id: string, filter: FilterFields): Promise<SavedFilterDto | null>;
  removeFilter(id: string): Promise<boolean>;
}

export function browserMetadataTransport(fetcher: typeof fetch = fetch): MetadataTransport {
  async function request<T>(method: string, path: string, body?: unknown): Promise<T | null> {
    let response: Response;
    try {
      // Same-origin cookie session; the API also checks Origin on writes.
      response = await fetcher(path, {
        method, credentials: "same-origin", cache: "no-store",
        ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
      });
    } catch { throw new AccountTransportError("CONNECTION_FAILED"); }
    if (response.status === 401) throw new AccountTransportError("UNAUTHENTICATED");
    if (response.status === 404) return null;
    if (response.status === 400) throw new AccountTransportError("INVALID_INPUT");
    if (!response.ok) throw new AccountTransportError(method === "GET" ? "TASKS_UNAVAILABLE" : "SAVE_FAILED");
    try { return await response.json() as T; }
    catch { throw new AccountTransportError("INVALID_RESPONSE"); }
  }
  const created = <T,>(value: T | null) => { if (!value) throw new AccountTransportError("SAVE_FAILED"); return value; };
  const labelPath = (id: string) => `/api/v1/labels/${encodeURIComponent(id)}`;
  const filterPath = (id: string) => `/api/v1/filters/${encodeURIComponent(id)}`;
  return {
    metadata: async () => {
      const metadata = await request<MetadataDto>("GET", "/api/v1/metadata");
      if (!metadata) throw new AccountTransportError("TASKS_UNAVAILABLE");
      return metadata;
    },
    label: (id) => request<LabelDetailDto>("GET", labelPath(id)),
    filter: (id) => request<FilterDetailDto>("GET", filterPath(id)),
    createLabel: async (id, label) => created(await request<{ label: LabelDto }>("POST", "/api/v1/labels", { id, ...label })).label,
    updateLabel: async (id, label) => (await request<{ label: LabelDto }>("PATCH", labelPath(id), label))?.label ?? null,
    removeLabel: async (id) => (await request<{ id: string }>("DELETE", labelPath(id))) !== null,
    createFilter: async (id, filter) => created(await request<{ filter: SavedFilterDto }>("POST", "/api/v1/filters", { id, ...filter })).filter,
    updateFilter: async (id, filter) => (await request<{ filter: SavedFilterDto }>("PATCH", filterPath(id), filter))?.filter ?? null,
    removeFilter: async (id) => (await request<{ id: string }>("DELETE", filterPath(id))) !== null,
  };
}

export function metadataTransport(): MetadataTransport {
  if (!isTauri()) return browserMetadataTransport();
  const command = async <T,>(name: string, args?: Record<string, unknown>): Promise<T> => {
    try { return await invoke<T>(name, args); }
    catch (error) { throw nativeAccountError(error); }
  };
  // One fixed native command per operation; Rust attaches the Keychain bearer.
  return {
    metadata: () => command<MetadataDto>("metadata"),
    label: (id) => command<LabelDetailDto | null>("label", { id }),
    filter: (id) => command<FilterDetailDto | null>("saved_filter", { id }),
    createLabel: async (id, label) => (await command<{ label: LabelDto }>("create_label", { id, label })).label,
    updateLabel: async (id, label) => (await command<{ label: LabelDto } | null>("update_label", { id, label }))?.label ?? null,
    removeLabel: async (id) => (await command<{ id: string } | null>("delete_label", { id })) !== null,
    createFilter: async (id, filter) => (await command<{ filter: SavedFilterDto }>("create_filter", { id, filter })).filter,
    updateFilter: async (id, filter) => (await command<{ filter: SavedFilterDto } | null>("update_filter", { id, filter }))?.filter ?? null,
    removeFilter: async (id) => (await command<{ id: string } | null>("delete_filter", { id })) !== null,
  };
}

/** Same convention as taskKeys. Task writes invalidate `all` (label and filter task lists). */
export const metadataKeys = {
  all: (userId: string) => [...taskKeys.user(userId), "metadata"] as const,
  list: (userId: string) => [...taskKeys.user(userId), "metadata", "list"] as const,
  label: (userId: string, id: string) => [...taskKeys.user(userId), "metadata", "label", id] as const,
  filter: (userId: string, id: string) => [...taskKeys.user(userId), "metadata", "filter", id] as const,
};

export function metadataQueries(transport: MetadataTransport) {
  return {
    list: (userId: string) => queryOptions({ queryKey: metadataKeys.list(userId), queryFn: () => transport.metadata() }),
    label: (userId: string, id: string) => queryOptions({ queryKey: metadataKeys.label(userId, id), queryFn: () => transport.label(id) }),
    filter: (userId: string, id: string) => queryOptions({ queryKey: metadataKeys.filter(userId, id), queryFn: () => transport.filter(id) }),
  };
}

/**
 * Writes plus the cache entries each makes stale. Not optimistic (the legacy
 * directory waited too). Any label or filter change refreshes every label/filter
 * read; deleting a label also changes tasks (their labelIds), so every task
 * read for the user is refreshed, as project deletion does.
 */
export function metadataMutations(transport: MetadataTransport, cache: QueryClient, userId: string) {
  const refresh = () => cache.invalidateQueries({ queryKey: metadataKeys.all(userId) });
  return {
    async createLabel(id: string, label: LabelFields) { const created = await transport.createLabel(id, label); await refresh(); return created; },
    async updateLabel(id: string, label: LabelFields) { const updated = await transport.updateLabel(id, label); await refresh(); return updated; },
    async removeLabel(id: string) {
      const removed = await transport.removeLabel(id);
      cache.removeQueries({ queryKey: metadataKeys.label(userId, id) });
      await cache.invalidateQueries({ queryKey: taskKeys.user(userId) });
      return removed;
    },
    async createFilter(id: string, filter: FilterFields) { const created = await transport.createFilter(id, filter); await refresh(); return created; },
    async updateFilter(id: string, filter: FilterFields) { const updated = await transport.updateFilter(id, filter); await refresh(); return updated; },
    async removeFilter(id: string) {
      const removed = await transport.removeFilter(id);
      cache.removeQueries({ queryKey: metadataKeys.filter(userId, id) });
      await refresh();
      return removed;
    },
  };
}
