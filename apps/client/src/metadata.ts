import { invoke, isTauri } from "@tauri-apps/api/core";
import { queryOptions, type QueryClient, type QueryFilters } from "@tanstack/react-query";
import { change, optimisticWrite } from "./optimistic";
import type {
  FilterAssistDto, FilterDefinition, FilterDetailDto, LabelDetailDto, LabelDto, MetadataDto, SavedFilterDto,
} from "../../../packages/server/src/metadata-input";
import { AccountTransportError, nativeAccountError } from "./errors";
import { taskChanges, taskKeys } from "./tasks";

export type { FilterAssistDto, FilterDefinition, FilterDetailDto, LabelDetailDto, LabelDto, MetadataDto, SavedFilterDto };
export interface LabelFields { name: string; color: string | null; favorite: boolean }
/**
 * A filter write: a query (the dialog always saves one, converting a legacy
 * definition), or a legacy definition kept as it is (e.g. toggling favorite).
 */
export interface FilterFields { name: string; query?: string; definition?: FilterDefinition; description: string | null; color: string | null; favorite: boolean }

/** Todoist's named palette (label and filter colours are stored as hex). */
export const namedColors = [
  ["Berry Red", "#b8256f"], ["Red", "#db4035"], ["Orange", "#ff9933"], ["Yellow", "#fad000"], ["Olive Green", "#afb83b"],
  ["Lime Green", "#7ecc49"], ["Green", "#299438"], ["Mint Green", "#6accbc"], ["Teal", "#158fad"], ["Sky Blue", "#14aaf5"],
  ["Light Blue", "#96c3eb"], ["Blue", "#4073ff"], ["Grape", "#884dff"], ["Violet", "#af38eb"], ["Lavender", "#eb96eb"],
  ["Magenta", "#e05194"], ["Salmon", "#ff8d85"], ["Charcoal", "#808080"], ["Grey", "#b8b8b8"], ["Taupe", "#ccac93"],
] as const;
/** The default colour, and how a label or filter without one is drawn. */
export const CHARCOAL = "#808080";

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
  /** Filter Assist: a description to a query the parser accepts, or the reason there is none. */
  assistFilter(description: string): Promise<FilterAssistDto>;
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
    assistFilter: async (description) => created(await request<FilterAssistDto>("POST", "/api/v1/filters/assist", { description })),
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
    assistFilter: (description) => command<FilterAssistDto>("assist_filter", { description }),
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
 * Label and filter writes, optimistic (optimistic.ts): the directory and pages
 * change at once and a failure takes back only that change. Any label or
 * filter change then refreshes every label/filter read; deleting a label also
 * changes tasks (their labelIds), so every task read for the user is refreshed.
 */
export function metadataMutations(transport: MetadataTransport, cache: QueryClient, userId: string) {
  const refresh: QueryFilters[] = [{ queryKey: metadataKeys.all(userId) }];
  const byName = <T extends { name: string }>(items: T[]) => [...items].sort((a, b) => a.name.localeCompare(b.name));
  // A saved query replaces a legacy definition.
  const asFilter = (filter: FilterFields) => ({ ...filter, query: filter.query ?? null, definition: filter.query ? null : filter.definition ?? null });
  const directory = (edit: (data: MetadataDto) => MetadataDto) => change<MetadataDto | undefined>(metadataKeys.list(userId), data => data && edit(data));
  const found = <T,>(value: T | null) => { if (!value) throw new AccountTransportError("SAVE_FAILED"); return value; };
  return {
    createLabel(id: string, label: LabelFields) {
      return optimisticWrite(cache, [directory(data => ({ ...data, labels: byName([...data.labels.filter(item => item.id !== id), { id, ...label }]) }))], () => transport.createLabel(id, label), refresh);
    },
    updateLabel(id: string, label: LabelFields) {
      return optimisticWrite(cache, [
        directory(data => ({ ...data, labels: byName(data.labels.map(item => item.id === id ? { ...item, ...label } : item)) })),
        change<LabelDetailDto | null | undefined>(metadataKeys.label(userId, id), data => data && { ...data, label: { ...data.label, ...label } }),
      ], async () => found(await transport.updateLabel(id, label)), refresh);
    },
    async removeLabel(id: string) {
      const removed = await optimisticWrite(cache, [
        directory(data => ({ ...data, labels: data.labels.filter(item => item.id !== id) })),
        ...taskChanges(userId, tasks => tasks.map(task => task.labelIds.includes(id) ? { ...task, labelIds: task.labelIds.filter(label => label !== id) } : task)),
      ], () => transport.removeLabel(id), [{ queryKey: taskKeys.user(userId) }]);
      cache.removeQueries({ queryKey: metadataKeys.label(userId, id) });
      return removed;
    },
    createFilter(id: string, filter: FilterFields) {
      return optimisticWrite(cache, [directory(data => ({ ...data, filters: byName([...data.filters.filter(item => item.id !== id), { id, ...asFilter(filter) }]) }))], () => transport.createFilter(id, filter), refresh);
    },
    updateFilter(id: string, filter: FilterFields) {
      return optimisticWrite(cache, [
        directory(data => ({ ...data, filters: byName(data.filters.map(item => item.id === id ? { ...item, ...asFilter(filter) } : item)) })),
        change<FilterDetailDto | null | undefined>(metadataKeys.filter(userId, id), data => data && { ...data, filter: { ...data.filter, ...asFilter(filter) } }),
      ], async () => found(await transport.updateFilter(id, filter)), refresh);
    },
    async removeFilter(id: string) {
      const removed = await optimisticWrite(cache, [directory(data => ({ ...data, filters: data.filters.filter(item => item.id !== id) }))], () => transport.removeFilter(id), refresh);
      cache.removeQueries({ queryKey: metadataKeys.filter(userId, id) });
      return removed;
    },
  };
}
