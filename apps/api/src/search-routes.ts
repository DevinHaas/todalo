import { Elysia } from "elysia";
import { toTaskDto, type TaskRecord } from "@todalo/server/task-dto";
import { findItems, searchQuery, searchTasks, type FindDto, type SearchDto } from "@todalo/server/search";

/** Every read is the session user's own rows; the routes never see another user's. */
export interface SearchStore {
  verify(headers: Headers): Promise<string | null>;
  /** getTasksForUser: every task of the user, sortOrder. */
  tasks(userId: string): Promise<TaskRecord[]>;
  /** The user's projects by name and sections by sortOrder, name (Quick Find). */
  projects(userId: string): Promise<{ id: string; name: string }[]>;
  sections(userId: string): Promise<{ id: string; projectId: string; name: string }[]>;
}

const UNAUTHENTICATED = { code: "UNAUTHENTICATED", message: "Please sign in again." } as const;

/** Read-only legacy search: `GET /search?q=` (the /search page) and `GET /find` (Quick Find candidates). */
export function createSearchRoutes(store: SearchStore) {
  return new Elysia({ prefix: "/api/v1" })
    .onBeforeHandle(({ set }) => { set.headers["cache-control"] = "no-store"; })
    .get("/search", async ({ request, query, status }) => {
      const userId = await store.verify(request.headers);
      if (!userId) return status(401, UNAUTHENTICATED);
      const q = searchQuery(query.q);
      return { query: q, tasks: searchTasks(await store.tasks(userId), q).map(toTaskDto) } satisfies SearchDto;
    })
    .get("/find", async ({ request, status }) => {
      const userId = await store.verify(request.headers);
      if (!userId) return status(401, UNAUTHENTICATED);
      const [tasks, projects, sections] = await Promise.all([store.tasks(userId), store.projects(userId), store.sections(userId)]);
      return { items: findItems(tasks, projects, sections) } satisfies FindDto;
    });
}
