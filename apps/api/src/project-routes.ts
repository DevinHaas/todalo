import { Elysia } from "elysia";
import { toTaskDto, type TaskRecord } from "@todalo/server/task-dto";
import {
  projectCreateInput, projectUpdateInput, toProjectDto, toProjectSummaryDto, toSectionDto,
  type DestinationsDto, type ProjectCreateInput, type ProjectDetailDto, type ProjectDto, type ProjectRecord, type ProjectsDto, type ProjectUpdateInput, type SectionDto,
} from "@todalo/server/project-dto";
import { sectionCreateInput, sectionNameInput } from "@todalo/server/organization-input";

export interface ProjectStore {
  /** Resolves the session user from cookies (browser) or bearer token (native). */
  verify(headers: Headers): Promise<string | null>;
  /** Browser origins allowed to write with an ambient cookie session. */
  allowedOrigins: Set<string>;
  /** Every project, archived included, with completedCount and openCount. */
  list(userId: string): Promise<ProjectRecord[]>;
  get(userId: string, id: string): Promise<ProjectRecord | null>;
  tasks(userId: string, projectId: string): Promise<TaskRecord[]>;
  create(userId: string, input: ProjectCreateInput): Promise<ProjectRecord>;
  /** Only the fields sent change; null when the project is missing or another user's. */
  update(userId: string, id: string, input: ProjectUpdateInput): Promise<ProjectRecord | null>;
  remove(userId: string, id: string): Promise<boolean>;
  /** The owner's sections of an owned project, in legacy order (sortOrder, name). */
  sections(userId: string, projectId: string): Promise<SectionDto[]>;
  /** null when the project is missing or another user's. */
  createSection(userId: string, projectId: string, name: string, after?: string | null): Promise<SectionDto | null>;
  /** null when the section is missing or another user's. */
  renameSection(userId: string, id: string, name: string): Promise<SectionDto | null>;
  removeSection(userId: string, id: string): Promise<boolean>;
  destinations(userId: string): Promise<DestinationsDto>;
}

const UNAUTHENTICATED = { code: "UNAUTHENTICATED", message: "Please sign in again." } as const;
const NOT_FOUND = { code: "NOT_FOUND", message: "This project does not exist or you do not have access to it." } as const;
const SECTION_NOT_FOUND = { code: "NOT_FOUND", message: "This section does not exist or you do not have access to it." } as const;
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
      return { projects: (await store.list(userId)).map(toProjectSummaryDto) } satisfies ProjectsDto;
    })
    .get("/projects/:id", async ({ request, params, status }) => {
      const userId = await store.verify(request.headers);
      if (!userId) return status(401, UNAUTHENTICATED);
      const project = await store.get(userId, params.id);
      if (!project) return status(404, NOT_FOUND);
      const [sections, tasks] = await Promise.all([store.sections(userId, project.id), store.tasks(userId, project.id)]);
      return { project: toProjectDto(project), sections: sections.map(toSectionDto), tasks: tasks.map(toTaskDto) } satisfies ProjectDetailDto;
    })
    .get("/destinations", async ({ request, status }) => {
      const userId = await store.verify(request.headers);
      if (!userId) return status(401, UNAUTHENTICATED);
      const { projects, sections } = await store.destinations(userId);
      return { projects: projects.map(({ id, name }) => ({ id, name })), sections: sections.map(toSectionDto) } satisfies DestinationsDto;
    })
    .post("/projects/:id/sections", async ({ request, params, body, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      const input = sectionCreateInput.safeParse(body);
      if (!input.success) return status(400, INVALID);
      const section = await store.createSection(userId, params.id, input.data.name, input.data.after);
      return section ? status(201, { section: toSectionDto(section) satisfies SectionDto }) : status(404, NOT_FOUND);
    })
    .patch("/sections/:id", async ({ request, params, body, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      const input = sectionNameInput.safeParse(body);
      if (!input.success) return status(400, INVALID);
      const section = await store.renameSection(userId, params.id, input.data.name);
      return section ? { section: toSectionDto(section) satisfies SectionDto } : status(404, SECTION_NOT_FOUND);
    })
    // Member tasks stay in the project without a section (schema SET NULL).
    .delete("/sections/:id", async ({ request, params, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      return await store.removeSection(userId, params.id) ? { id: params.id } : status(404, SECTION_NOT_FOUND);
    })
    .post("/projects", async ({ request, body, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      const input = projectCreateInput.safeParse(body);
      if (!input.success) return status(400, INVALID);
      return status(201, { project: toProjectDto(await store.create(userId, input.data)) satisfies ProjectDto });
    })
    .patch("/projects/:id", async ({ request, params, body, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      // Edit, favorite, archive/unarchive, description and Display settings.
      const input = projectUpdateInput.safeParse(body);
      if (!input.success) return status(400, INVALID);
      const project = await store.update(userId, params.id, input.data);
      return project ? { project: toProjectDto(project) satisfies ProjectDto } : status(404, NOT_FOUND);
    })
    .delete("/projects/:id", async ({ request, params, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      return await store.remove(userId, params.id) ? { id: params.id } : status(404, NOT_FOUND);
    });
}
