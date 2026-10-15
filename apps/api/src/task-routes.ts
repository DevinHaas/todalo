import { Elysia } from "elysia";
import { toTaskDto, type TaskDto, type TaskRecord, type TodayDto } from "@todalo/server/task-dto";

export interface TaskReads {
  /** Resolves the session user from cookies (browser) or bearer token (native). */
  verify(headers: Headers): Promise<string | null>;
  today(userId: string): Promise<{ tasks: TaskRecord[]; openCount: number }>;
  task(userId: string, id: string): Promise<TaskRecord | null>;
}

const UNAUTHENTICATED = { code: "UNAUTHENTICATED", message: "Please sign in again." } as const;
const NOT_FOUND = { code: "NOT_FOUND", message: "This task does not exist or you do not have access to it." } as const;

// Error envelope shared with /api/v1/account: { code, message }. The user ID is
// only ever the authenticated session's; no request parameter can select it.
export function createTaskRoutes(reads: TaskReads) {
  return new Elysia({ prefix: "/api/v1" })
    .get("/today", async ({ request, status, set }) => {
      set.headers["cache-control"] = "no-store";
      const userId = await reads.verify(request.headers);
      if (!userId) return status(401, UNAUTHENTICATED);
      const { tasks, openCount } = await reads.today(userId);
      return { tasks: tasks.map(toTaskDto), openCount } satisfies TodayDto;
    })
    .get("/tasks/:id", async ({ request, params, status, set }) => {
      set.headers["cache-control"] = "no-store";
      const userId = await reads.verify(request.headers);
      if (!userId) return status(401, UNAUTHENTICATED);
      // Missing and foreign IDs share one response so IDs cannot be probed.
      const task = await reads.task(userId, params.id);
      return task ? { task: toTaskDto(task) satisfies TaskDto } : status(404, NOT_FOUND);
    });
}
