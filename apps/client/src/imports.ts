import { invoke, isTauri } from "@tauri-apps/api/core";
import { AccountTransportError, nativeAccountError } from "./errors";

// Todoist import (.scratch/todoist-import). The server holds the Todoist token;
// clients only open the authorize page and read status/preview.
export interface ImportInclude { sections: boolean; subtasks: boolean; labels: boolean; recurring: boolean; comments: boolean; completed: boolean; completedRange?: CompletedRange }
/** How far back completed tasks are imported. */
export type CompletedRange = "quarter" | "year" | "all";
export interface ImportSelection { projectIds: string[]; include: ImportInclude; timeZone: string }
export interface ImportPreview {
  projects: { id: string; name: string; inbox: boolean; tasks: number; imported: number }[];
  counts: { sections: number; subtasks: number; labels: number; recurring: number; comments: number };
}
export interface ImportResult { created: { projects: number; sections: number; tasks: number; labels: number }; skipped: number; warnings: string[] }
/** `prompt`: show the one-time post-sign-up "Import from Todoist?" dialog. */
export type ImportStatus = { prompt?: boolean } & (
  | { status: "idle" | "pending" | "running" }
  | { status: "connected"; preview: ImportPreview }
  | { status: "failed"; error?: "denied" | "failed" }
  | { status: "done"; result: ImportResult });

export interface ImportTransport {
  status(timeZone: string): Promise<ImportStatus>;
  connect(): Promise<void>;
  run(selection: ImportSelection): Promise<ImportResult>;
  disconnect(): Promise<void>;
  promptSeen(): Promise<void>;
}

export const defaultInclude: ImportInclude = { sections: true, subtasks: true, labels: true, recurring: true, comments: true, completed: false, completedRange: "quarter" };

export function browserImportTransport(fetcher: typeof fetch = fetch, location: Pick<Location, "assign"> = window.location): ImportTransport {
  async function request<T>(method: string, path = "", body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetcher(`/api/v1/imports/todoist${path}`, {
        method, credentials: "same-origin", cache: "no-store",
        ...(body !== undefined && { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
      });
    } catch { throw new AccountTransportError("CONNECTION_FAILED"); }
    if (response.status === 401) throw new AccountTransportError("UNAUTHENTICATED");
    if (response.status === 400) throw new AccountTransportError("INVALID_INPUT");
    if (!response.ok) throw new AccountTransportError("IMPORT_UNAVAILABLE");
    return response.json();
  }
  return {
    status: (timeZone) => request("GET", `?${new URLSearchParams({ timeZone })}`),
    async connect() { location.assign((await request<{ authorizeUrl: string }>("POST", "/connect")).authorizeUrl); },
    run: async (selection) => (await request<{ result: ImportResult }>("POST", "/run", selection)).result,
    disconnect: async () => { await request("DELETE"); },
    promptSeen: async () => { await request("POST", "/prompt"); },
  };
}

export function importTransport(): ImportTransport {
  if (!isTauri()) return browserImportTransport();
  const command = async <T>(name: string, args?: Record<string, unknown>): Promise<T> => {
    try { return await invoke<T>(name, args); }
    catch (error) { throw nativeAccountError(error); }
  };
  // Fixed native commands; Rust attaches the Keychain bearer and opens only Todoist's authorize page.
  return {
    status: (timeZone) => command("import_status", { timeZone }),
    connect: () => command("import_connect"),
    run: async (selection) => (await command<{ result: ImportResult }>("import_run", { selection })).result,
    disconnect: () => command("import_disconnect"),
    promptSeen: () => command("import_prompt_seen"),
  };
}

export const importKeys = { status: (userId: string) => ["user", userId, "import", "todoist"] as const };
