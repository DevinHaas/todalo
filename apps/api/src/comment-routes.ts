import { Elysia } from "elysia";
import { commentInput, type CommentDto, type CommentInput } from "@todalo/server/comment-dto";
import { writeUser } from "./project-routes";

/** Shared @todalo/server/comments operations; null means missing or another user's. */
export interface CommentStore {
  verify(headers: Headers): Promise<string | null>;
  allowedOrigins: ReadonlySet<string>;
  list(userId: string, taskId: string): Promise<CommentDto[] | null>;
  /** "conflict": the client-chosen ID belongs to another user's comment. */
  add(userId: string, taskId: string, input: CommentInput): Promise<CommentDto | null | "conflict">;
  remove(userId: string, id: string): Promise<boolean>;
}

const UNAUTHENTICATED = { code: "UNAUTHENTICATED", message: "Please sign in again." } as const;
const FORBIDDEN = { code: "FORBIDDEN_ORIGIN", message: "This request was not sent by todalo." } as const;
const INVALID = { code: "INVALID_INPUT", message: "Check your entry and try again." } as const;
const CONFLICT = { code: "COMMENT_CONFLICT", message: "This comment could not be saved. Try again." } as const;
const missing = (resource: string) => ({ code: "NOT_FOUND", message: `This ${resource} does not exist or you do not have access to it.` }) as const;

// Same envelope, ownership and write rules (bearer, or cookie + allowed Origin) as task-routes.ts.
export function createCommentRoutes(store: CommentStore) {
  const writer = (request: Request) => writeUser(store, request);
  return new Elysia({ prefix: "/api/v1" })
    .onAfterHandle(({ set }) => { set.headers["cache-control"] = "no-store"; })
    .onError(({ code, status }) => code === "PARSE" ? status(400, INVALID) : undefined)
    .get("/tasks/:id/comments", async ({ request, params, status }) => {
      const userId = await store.verify(request.headers);
      if (!userId) return status(401, UNAUTHENTICATED);
      const comments = await store.list(userId, params.id);
      return comments ? { comments } : status(404, missing("task"));
    })
    .post("/tasks/:id/comments", async ({ request, params, body, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      const input = commentInput.safeParse(body);
      if (!input.success) return status(400, INVALID);
      const comment = await store.add(userId, params.id, input.data);
      if (comment === "conflict") return status(409, CONFLICT);
      return comment ? status(201, { comment }) : status(404, missing("task"));
    })
    .delete("/comments/:id", async ({ request, params, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      return await store.remove(userId, params.id) ? { id: params.id } : status(404, missing("comment"));
    });
}
