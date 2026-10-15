import { Elysia } from "elysia";
import { toTaskDto, type TaskRecord } from "@todalo/server/task-dto";
import { parseProjectName, toProjectDto, type ProjectDetailDto, type ProjectDto, type ProjectRecord, type ProjectsDto } from "@todalo/server/project-dto";

export interface ProjectStore {
  /** Resolves the session user from cookies (browser) or bearer token (native). */
  verify(headers: Headers): Promise<string | null>;
  /** Browser origins allowed to write with an ambient cookie session. */
  allowedOrigins: Set<string>;
  list(userId: string): Promise<ProjectRecord[]>;
  get(userId: string, id: string): Promise<ProjectRecord | null>;
  tasks(userId: string, projectId: string): Promise<TaskRecord[]>;
  create(userId: string, name: string): Promise<ProjectRecord>;
  rename(userId: string, id: string, name: string): Promise<ProjectRecord | null>;
  remove(userId: string, id: string): Promise<boolean>;
}

const UNAUTHENTICATED = { code: "UNAUTHENTICATED", message: "Please sign in again." } as const;
const NOT_FOUND = { code: "NOT_FOUND", message: "This project does not exist or you do not have access to it." } as const;
const FORBIDDEN = { code: "FORBIDDEN_ORIGIN", message: "This request was not sent by todalo." } as const;
const INVALID = { code: "INVALID_INPUT", message: "Check your entry and try again." } as const;

// Same envelope and ownership rules as task-routes.ts. Missing and foreign IDs
// share one 404 so IDs cannot be probed.
/** Writes: a bearer header (native) authenticates by itself and cookies are
 * ignored; a cookie session must come from an allowed Origin (CSRF guard). */
export async function writeUser(store: Pick<ProjectStore, "verify"> & { allowedOrigins: ReadonlySet<string> }, request: Request): Promise<string | null | "forbidden"> {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) return store.verify(new Headers({ authorization }));
  const origin = request.headers.get("origin");
  if (!origin || !store.allowedOrigins.has(origin)) return "forbidden";
  return store.verify(request.headers);
}

export function createProjectRoutes(store: ProjectStore) {
  const writer = (request: Request) => writeUser(store, request);

  return new Elysia({ prefix: "/api/v1" })
    .onAfterHandle(({ set }) => { set.headers["cache-control"] = "no-store"; })
    .get("/projects", async ({ request, status }) => {
      const userId = await store.verify(request.headers);
      if (!userId) return status(401, UNAUTHENTICATED);
      return { projects: (await store.list(userId)).map(toProjectDto) } satisfies ProjectsDto;
    })
    .get("/projects/:id", async ({ request, params, status }) => {
      const userId = await store.verify(request.headers);
      if (!userId) return status(401, UNAUTHENTICATED);
      const project = await store.get(userId, params.id);
      if (!project) return status(404, NOT_FOUND);
      const tasks = await store.tasks(userId, project.id);
      return { project: toProjectDto(project), tasks: tasks.map(toTaskDto) } satisfies ProjectDetailDto;
    })
    .post("/projects", async ({ request, body, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      const name = parseProjectName(body);
      if (!name) return status(400, INVALID);
      return status(201, { project: toProjectDto(await store.create(userId, name)) satisfies ProjectDto });
    })
    .patch("/projects/:id", async ({ request, params, body, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      const name = parseProjectName(body);
      if (!name) return status(400, INVALID);
      const project = await store.rename(userId, params.id, name);
      return project ? { project: toProjectDto(project) satisfies ProjectDto } : status(404, NOT_FOUND);
    })
    .delete("/projects/:id", async ({ request, params, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      return await store.remove(userId, params.id) ? { id: params.id } : status(404, NOT_FOUND);
    });
}
