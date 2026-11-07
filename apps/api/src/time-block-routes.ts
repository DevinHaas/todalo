import { Elysia } from "elysia";
import {
  createTimeBlockInput, toTimeBlockDto, updateTimeBlockInput,
  type CreateTimeBlockInput, type TimeBlockDto, type TimeBlockRecord, type TimeBlocksDto, type UpdateTimeBlockInput,
} from "@todalo/server/time-block-dto";
import { writeUser } from "./project-routes";

export interface TimeBlockStore {
  verify(headers: Headers): Promise<string | null>;
  allowedOrigins: ReadonlySet<string>;
  /** The owner's recent and upcoming blocks, by start. */
  list(userId: string): Promise<TimeBlockRecord[]>;
  /** null when the goal is missing or foreign. */
  create(userId: string, input: CreateTimeBlockInput): Promise<TimeBlockRecord | null>;
  /** null when the block or the new goal is missing or foreign. */
  update(userId: string, id: string, patch: UpdateTimeBlockInput): Promise<TimeBlockRecord | null>;
  /** false when missing or foreign. */
  remove(userId: string, id: string): Promise<boolean>;
}

const UNAUTHENTICATED = { code: "UNAUTHENTICATED", message: "Please sign in again." } as const;
const NOT_FOUND = { code: "NOT_FOUND", message: "This time block or goal does not exist or you do not have access to it." } as const;
const FORBIDDEN = { code: "FORBIDDEN_ORIGIN", message: "This request was not sent by todalo." } as const;
const INVALID = { code: "INVALID_INPUT", message: "Check your entry and try again." } as const;

// Goals ticket 07. Same envelope and ownership rules as goal-routes.ts. Scheduled
// tasks never come through here: their start and end stay on the task.
export function createTimeBlockRoutes(store: TimeBlockStore) {
  const writer = (request: Request) => writeUser(store, request);

  return new Elysia({ prefix: "/api/v1" })
    .onAfterHandle(({ set }) => { set.headers["cache-control"] = "no-store"; })
    .onError(({ code, status }) => code === "PARSE" ? status(400, INVALID) : undefined)
    .get("/time-blocks", async ({ request, status }) => {
      const userId = await store.verify(request.headers);
      if (!userId) return status(401, UNAUTHENTICATED);
      return { blocks: (await store.list(userId)).map(toTimeBlockDto) } satisfies TimeBlocksDto;
    })
    .post("/time-blocks", async ({ request, body, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      const input = createTimeBlockInput.safeParse(body);
      if (!input.success) return status(400, INVALID);
      const block = await store.create(userId, input.data);
      return block ? status(201, { block: toTimeBlockDto(block) satisfies TimeBlockDto }) : status(404, NOT_FOUND);
    })
    .patch("/time-blocks/:id", async ({ request, params, body, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      const input = updateTimeBlockInput.safeParse(body);
      if (!input.success) return status(400, INVALID);
      const block = await store.update(userId, params.id, input.data);
      return block ? { block: toTimeBlockDto(block) satisfies TimeBlockDto } : status(404, NOT_FOUND);
    })
    .delete("/time-blocks/:id", async ({ request, params, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      return await store.remove(userId, params.id) ? { id: params.id } : status(404, NOT_FOUND);
    });
}
