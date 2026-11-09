import { Elysia } from "elysia";
import { bulkCompleteInput, bulkIdsInput, bulkMetadataInput, bulkMoveInput, reorderInput, type BulkCompletionDto, type ReorderInput } from "@todalo/server/bulk-input";
import { MissingReferenceError } from "@todalo/server/metadata-input";
import { writeUser } from "./project-routes";
import { CRITERIA_OPEN } from "./task-routes";
import type { Horizon } from "@todalo/server/task-dto";

/**
 * Shared @todalo/server/bulk operations (ticket 15). Each checks that every
 * selected task is the user's before writing anything; null/false means some
 * task (or the move's destination) is missing or another user's.
 */
export interface BulkWrites {
  verify(headers: Headers): Promise<string | null>;
  allowedOrigins: ReadonlySet<string>;
  /** "criteria": some task is a milestone with open done criteria and `confirmCriteria` is not set; nothing was written. */
  complete(userId: string, tasks: { id: string; occurrence: Date | null }[], operationId: string, confirmCriteria: boolean): Promise<BulkCompletionDto | null | "criteria">;
  remove(userId: string, ids: string[]): Promise<boolean>;
  clearDates(userId: string, ids: string[]): Promise<boolean>;
  /** Throws MissingReferenceError for a deleted or foreign label. */
  metadata(userId: string, ids: string[], change: { priority?: number; deadline?: Date | null; labelIds?: string[]; horizon?: Horizon | null }): Promise<boolean>;
  move(userId: string, ids: string[], destination: { projectId: string | null; sectionId: string | null }): Promise<boolean>;
  /** Place next to an anchor and/or set a status (appending without an anchor). "invalid": the anchor is in another collection (or is the task itself). */
  reorder(userId: string, id: string, move: ReorderInput): Promise<boolean | "invalid" | "criteria">;
}

const UNAUTHENTICATED = { code: "UNAUTHENTICATED", message: "Please sign in again." } as const;
const NOT_FOUND = { code: "NOT_FOUND", message: "This task does not exist or you do not have access to it." } as const;
const INVALID = { code: "INVALID_INPUT", message: "Check your entry and try again." } as const;
const FORBIDDEN_ORIGIN = { code: "FORBIDDEN_ORIGIN", message: "This request was not sent by todalo." } as const;

// Same envelope and write rules as task-routes.ts. A selection with any missing
// or foreign ID is one 404 and nothing is written, so IDs cannot be probed and
// a mixed selection never half-applies.
export function createBulkRoutes(deps: BulkWrites) {
  const writer = (request: Request) => writeUser(deps, request);
  const date = (value: string | null) => value === null ? null : new Date(value);
  return new Elysia({ prefix: "/api/v1" })
    .onBeforeHandle(({ set }) => { set.headers["cache-control"] = "no-store"; })
    .onError(({ code, error, status }) => code === "PARSE" || error instanceof MissingReferenceError ? status(400, INVALID) : undefined)
    .post("/bulk/:action", async ({ request, params, body, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN_ORIGIN);
      if (!userId) return status(401, UNAUTHENTICATED);
      if (params.action === "complete") {
        const input = bulkCompleteInput.safeParse(body);
        if (!input.success) return status(400, INVALID);
        const result = await deps.complete(userId, input.data.tasks.map(task => ({ id: task.id, occurrence: date(task.occurrence) })), input.data.operationId, input.data.confirmCriteria ?? false);
        if (result === "criteria") return status(428, CRITERIA_OPEN);
        return result ? result satisfies BulkCompletionDto : status(404, NOT_FOUND);
      }
      if (params.action === "metadata") {
        const input = bulkMetadataInput.safeParse(body);
        if (!input.success) return status(400, INVALID);
        const { ids, deadline, ...change } = input.data;
        return await deps.metadata(userId, ids, { ...change, ...(deadline !== undefined && { deadline: date(deadline) }) }) ? { ids } : status(404, NOT_FOUND);
      }
      if (params.action === "move") {
        const input = bulkMoveInput.safeParse(body);
        if (!input.success) return status(400, INVALID);
        const { ids, ...destination } = input.data;
        return await deps.move(userId, ids, destination) ? { ids } : status(404, NOT_FOUND);
      }
      const write = params.action === "delete" ? deps.remove : params.action === "clear-date" ? deps.clearDates : null;
      if (!write) return status(404, NOT_FOUND);
      const input = bulkIdsInput.safeParse(body);
      if (!input.success) return status(400, INVALID);
      return await write(userId, input.data.ids) ? { ids: input.data.ids } : status(404, NOT_FOUND);
    })
    .post("/tasks/:id/reorder", async ({ request, params, body, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN_ORIGIN);
      if (!userId) return status(401, UNAUTHENTICATED);
      const input = reorderInput.safeParse(body);
      if (!input.success) return status(400, INVALID);
      const result = await deps.reorder(userId, params.id, input.data);
      if (result === "invalid") return status(400, INVALID);
      if (result === "criteria") return status(428, CRITERIA_OPEN);
      return result ? { id: params.id } : status(404, NOT_FOUND);
    });
}
