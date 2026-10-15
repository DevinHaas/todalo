import { Elysia } from "elysia";
import { toTaskDto, type TaskDto, type TaskRecord, type TodayDto } from "@todalo/server/task-dto";
import { basicTaskInput, completionInput, taskDetailsInput, type BasicTaskInput, type TaskDetailsInput } from "@todalo/server/task-input";
import { taskOrganizationInput, type TaskOrganizationInput } from "@todalo/server/organization-input";
import { writeUser } from "./project-routes";

export interface TaskReads {
  /** Resolves the session user from cookies (browser) or bearer token (native). */
  verify(headers: Headers): Promise<string | null>;
  today(userId: string): Promise<{ tasks: TaskRecord[]; openCount: number }>;
  task(userId: string, id: string): Promise<TaskRecord | null>;
}

/** Shared @todalo/server/tasks operations; null means missing or another user's. */
export interface TaskWrites {
  /** Browser origins allowed to write with an ambient cookie session (CSRF). */
  allowedOrigins: ReadonlySet<string>;
  /** null: the client-chosen ID already belongs to another user. */
  create(userId: string, input: BasicTaskInput): Promise<{ task: TaskRecord; created: boolean } | null>;
  /** "changed": `occurrence` is no longer the task's due date, nothing was written. */
  complete(userId: string, id: string, request: { occurrence?: Date | null; operationId?: string }): Promise<TaskRecord | null | "changed">;
  /** "changed": the task was edited elsewhere since `details.updatedAt`, nothing was written. */
  update(userId: string, id: string, details: TaskDetailsInput): Promise<TaskRecord | null | "changed">;
  /**
   * A move or parent change through the same updateTask. null also covers a
   * missing or foreign project, section or parent; "invalid" a hierarchy rule
   * (own parent, sub-task of a sub-task, nesting a task that has sub-tasks).
   */
  organize(userId: string, id: string, change: TaskOrganizationInput): Promise<TaskRecord | null | "changed" | "invalid">;
  remove(userId: string, id: string): Promise<boolean>;
}

const UNAUTHENTICATED = { code: "UNAUTHENTICATED", message: "Please sign in again." } as const;
const NOT_FOUND = { code: "NOT_FOUND", message: "This task does not exist or you do not have access to it." } as const;
const INVALID = { code: "INVALID_INPUT", message: "Check your entry and try again." } as const;
const TASK_CONFLICT = { code: "TASK_CONFLICT", message: "This task could not be saved. Try again." } as const;
const FORBIDDEN_ORIGIN = { code: "FORBIDDEN_ORIGIN", message: "This request was not sent by todalo." } as const;
// 412: the client's copy (due date or version) is stale; it should refetch.
const TASK_CHANGED = { code: "TASK_CHANGED", message: "This task changed on another device. Review it and try again." } as const;

// Error envelope shared with /api/v1/account: { code, message }. The user ID is
// only ever the authenticated session's; no request parameter can select it.
export function createTaskRoutes(deps: TaskReads & TaskWrites) {
  // Writes: writeUser (project-routes.ts) — bearer alone, or cookie + allowed Origin.
  const writer = (request: Request) => writeUser(deps, request);
  return new Elysia({ prefix: "/api/v1" })
    .onBeforeHandle(({ set }) => { set.headers["cache-control"] = "no-store"; })
    // Malformed JSON gets the same envelope as a schema failure.
    .onError(({ code, status }) => code === "PARSE" ? status(400, INVALID) : undefined)
    .get("/today", async ({ request, status }) => {
      const userId = await deps.verify(request.headers);
      if (!userId) return status(401, UNAUTHENTICATED);
      const { tasks, openCount } = await deps.today(userId);
      return { tasks: tasks.map(toTaskDto), openCount } satisfies TodayDto;
    })
    .get("/tasks/:id", async ({ request, params, status }) => {
      const userId = await deps.verify(request.headers);
      if (!userId) return status(401, UNAUTHENTICATED);
      // Missing and foreign IDs share one response so IDs cannot be probed.
      const task = await deps.task(userId, params.id);
      return task ? { task: toTaskDto(task) satisfies TaskDto } : status(404, NOT_FOUND);
    })
    .post("/tasks", async ({ request, body, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN_ORIGIN);
      if (!userId) return status(401, UNAUTHENTICATED);
      const input = basicTaskInput.safeParse(body);
      if (!input.success || input.data.dueDateEnd && !input.data.dueDate) return status(400, INVALID);
      const result = await deps.create(userId, input.data);
      if (!result) return status(409, TASK_CONFLICT);
      // 200 for a replayed operation ID: the original task, no second copy.
      return status(result.created ? 201 : 200, { task: toTaskDto(result.task) satisfies TaskDto });
    })
    .post("/tasks/:id/complete", async ({ request, params, body, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN_ORIGIN);
      if (!userId) return status(401, UNAUTHENTICATED);
      const input = completionInput.safeParse(body ?? undefined);
      if (!input.success) return status(400, INVALID);
      const { occurrence, operationId } = input.data ?? {};
      const task = await deps.complete(userId, params.id, { occurrence: occurrence == null ? occurrence : new Date(occurrence), operationId });
      if (task === "changed") return status(412, TASK_CHANGED);
      return task ? { task: toTaskDto(task) satisfies TaskDto } : status(404, NOT_FOUND);
    })
    .patch("/tasks/:id", async ({ request, params, body, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN_ORIGIN);
      if (!userId) return status(401, UNAUTHENTICATED);
      // Ticket 13: the same PATCH also takes one organization change (both strict, so a body is one or the other).
      const organization = taskOrganizationInput.safeParse(body);
      let task: Awaited<ReturnType<TaskWrites["organize"]>>;
      if (organization.success) task = await deps.organize(userId, params.id, organization.data);
      else {
        const input = taskDetailsInput.safeParse(body);
        if (!input.success) return status(400, INVALID);
        task = await deps.update(userId, params.id, input.data);
      }
      if (task === "invalid") return status(400, INVALID);
      if (task === "changed") return status(412, TASK_CHANGED);
      return task ? { task: toTaskDto(task) satisfies TaskDto } : status(404, NOT_FOUND);
    })
    .delete("/tasks/:id", async ({ request, params, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN_ORIGIN);
      if (!userId) return status(401, UNAUTHENTICATED);
      return await deps.remove(userId, params.id) ? { id: params.id } : status(404, NOT_FOUND);
    });
}
