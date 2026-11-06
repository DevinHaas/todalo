import { Elysia } from "elysia";
import { AttachmentError, attachmentDownload, readUploadForm, uploadedFiles, type StoredAttachment, type UploadedFile } from "@todalo/server/attachment-http";
import type { AttachmentDto, FileTasksDto } from "@todalo/server/attachment-limits";
import { writeUser, type ProjectStore } from "./project-routes";

/** Shared @todalo/server/attachments operations. They throw AttachmentError:
 * 404 for missing and foreign IDs alike, 400 for files outside the limits. */
export interface AttachmentStore extends Pick<ProjectStore, "verify" | "allowedOrigins"> {
  createFileTasks(userId: string, projectId: string, files: UploadedFile[]): Promise<FileTasksDto["tasks"]>;
  list(userId: string, taskId: string): Promise<AttachmentDto[]>;
  read(userId: string, id: string): Promise<StoredAttachment>;
}

const UNAUTHENTICATED = { code: "UNAUTHENTICATED", message: "Please sign in again." } as const;
const FORBIDDEN = { code: "FORBIDDEN_ORIGIN", message: "This request was not sent by todalo." } as const;
const INVALID = { code: "INVALID_INPUT", message: "Check your entry and try again." } as const;
const TOO_LARGE = { code: "FILES_TOO_LARGE", message: "A paste batch must be at most 10 MB." } as const;
const missing = (resource: string) => ({ code: "NOT_FOUND", message: `This ${resource} does not exist or you do not have access to it.` }) as const;

// Same envelope, ownership and write rules as project-routes.ts. Downloads are
// reads (cookie or bearer) and always force a sandboxed attachment response.
export function createAttachmentRoutes(store: AttachmentStore) {
  function failure(error: unknown, resource: string, status: (code: 400 | 404 | 413, body: object) => unknown) {
    if (!(error instanceof AttachmentError)) throw error;
    if (error.status === 404) return status(404, missing(resource));
    return status(error.status === 413 ? 413 : 400, error.status === 413 ? TOO_LARGE : INVALID);
  }
  return new Elysia({ prefix: "/api/v1" })
    .onAfterHandle(({ set }) => { set.headers["cache-control"] ??= "no-store"; })
    // Each file becomes a task in the project (legacy paste semantics, one transaction).
    .post("/projects/:id/files", async ({ request, params, status }) => {
      const userId = await writeUser(store, request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      try {
        const files = uploadedFiles(await readUploadForm(request));
        return status(201, { tasks: await store.createFileTasks(userId, params.id, files) } satisfies FileTasksDto);
      } catch (error) { return failure(error, "project", status); }
    }, { parse: "none" })
    .get("/tasks/:id/attachments", async ({ request, params, status }) => {
      const userId = await store.verify(request.headers);
      if (!userId) return status(401, UNAUTHENTICATED);
      try { return { attachments: await store.list(userId, params.id) }; }
      catch (error) { return failure(error, "task", status); }
    })
    .get("/attachments/:id", async ({ request, params, status }) => {
      const userId = await store.verify(request.headers);
      if (!userId) return status(401, UNAUTHENTICATED);
      try { return attachmentDownload(await store.read(userId, params.id)); }
      catch (error) { return failure(error, "attachment", status); }
    });
}
