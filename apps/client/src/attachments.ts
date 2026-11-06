import { invoke, isTauri } from "@tauri-apps/api/core";
import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { ATTACHMENT_LIMIT_HINT, validateAttachmentFiles, type AttachmentDto, type FileTasksDto } from "../../../packages/server/src/attachment-limits";
import { AccountTransportError, nativeAccountError } from "./errors";
import { projectKeys } from "./projects";
import { taskKeys } from "./tasks";

export { ATTACHMENT_LIMIT_HINT };
export type { AttachmentDto };
export type CreatedFileTask = FileTasksDto["tasks"][number];
export interface SavedFile { name: string; location: string }

export interface AttachmentTransport {
  /** Creates one task per file in the project; null when the project is missing or not the user's. */
  upload(projectId: string, files: File[]): Promise<CreatedFileTask[] | null>;
  /** null when the task is missing or not the signed-in user's. */
  list(taskId: string): Promise<AttachmentDto[] | null>;
  /** Browser: a same-origin download link the cookie session follows. */
  href?(id: string): string;
  /** Native: Rust downloads with the Keychain bearer and saves to a user-visible folder. */
  save?(attachment: AttachmentDto): Promise<SavedFile | null>;
}

export function browserAttachmentTransport(fetcher: typeof fetch = fetch): AttachmentTransport {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T | null> {
    let response: Response;
    try { response = await fetcher(path, { credentials: "same-origin", cache: "no-store", ...init }); }
    catch { throw new AccountTransportError("CONNECTION_FAILED"); }
    if (response.status === 401) throw new AccountTransportError("UNAUTHENTICATED");
    if (response.status === 404) return null;
    if (response.status === 400) throw new AccountTransportError("INVALID_INPUT");
    if (response.status === 413) throw new AccountTransportError("FILES_TOO_LARGE");
    if (!response.ok) throw new AccountTransportError(init.method === "POST" ? "SAVE_FAILED" : "TASKS_UNAVAILABLE");
    try { return await response.json() as T; }
    catch { throw new AccountTransportError("INVALID_RESPONSE"); }
  }
  return {
    upload: async (projectId, files) => {
      // The browser sets the multipart boundary; the API also checks Origin.
      const body = new FormData();
      files.forEach(file => body.append("files", file));
      return (await request<FileTasksDto>(`/api/v1/projects/${encodeURIComponent(projectId)}/files`, { method: "POST", body }))?.tasks ?? null;
    },
    list: async (taskId) => (await request<{ attachments: AttachmentDto[] }>(`/api/v1/tasks/${encodeURIComponent(taskId)}/attachments`))?.attachments ?? null,
    href: (id) => `/api/v1/attachments/${encodeURIComponent(id)}`,
  };
}

/** Header-safe JSON: non-ASCII characters become \u escapes that serde decodes. */
const asciiJson = (value: unknown) => JSON.stringify(value).replace(/[\u007f-￿]/g, character => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`);

export function attachmentTransport(): AttachmentTransport {
  if (!isTauri()) return browserAttachmentTransport();
  const command = async <T,>(name: string, args?: Parameters<typeof invoke>[1], options?: Parameters<typeof invoke>[2]): Promise<T> => {
    try { return await invoke<T>(name, args, options); }
    catch (error) { throw nativeAccountError(error); }
  };
  return {
    // One raw IPC body (the files back to back) plus their metadata; Rust
    // re-validates the limits and builds the multipart request.
    async upload(projectId, files) {
      const bytes = new Uint8Array(files.reduce((total, file) => total + file.size, 0));
      let offset = 0;
      for (const file of files) { bytes.set(new Uint8Array(await file.arrayBuffer()), offset); offset += file.size; }
      const metadata = asciiJson(files.map(file => ({ name: file.name, type: file.type, size: file.size })));
      return (await command<FileTasksDto | null>("upload_files", bytes, { headers: { "x-todalo-project": projectId, "x-todalo-files": metadata } }))?.tasks ?? null;
    },
    list: async (taskId) => (await command<{ attachments: AttachmentDto[] } | null>("attachments", { id: taskId }))?.attachments ?? null,
    save: (attachment) => command<SavedFile | null>("save_attachment", { id: attachment.id, name: attachment.name }),
  };
}

export const attachmentKeys = {
  // Under the task key, so invalidating a task also refreshes its attachments.
  task: (userId: string, taskId: string) => [...taskKeys.task(userId, taskId), "attachments"] as const,
};

export function attachmentQueries(transport: AttachmentTransport) {
  return {
    task: (userId: string, taskId: string) => queryOptions({ queryKey: attachmentKeys.task(userId, taskId), queryFn: () => transport.list(taskId) }),
  };
}

export function attachmentMutations(transport: AttachmentTransport, cache: QueryClient, userId: string) {
  return {
    /** Legacy limits are checked first so the user sees the specific rule. */
    async upload(projectId: string, files: File[]) {
      validateAttachmentFiles(files);
      const tasks = await transport.upload(projectId, files);
      if (!tasks) throw new AccountTransportError("PROJECT_NOT_FOUND");
      // File tasks are undated, so only the project's task list changes.
      await cache.invalidateQueries({ queryKey: projectKeys.detail(userId, projectId) });
      return tasks;
    },
  };
}
