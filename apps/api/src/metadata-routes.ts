import { Elysia } from "elysia";
import { toTaskDto, type TaskRecord } from "@todalo/server/task-dto";
import {
  filterAssistInput, filterCreateRequest, filterInput, labelCreateRequest, labelInput, matchesSavedFilter, MissingReferenceError, toLabelDto,
  type FilterAssistDto, type FilterDetailDto, type FilterInput, type LabelDetailDto, type LabelDto, type LabelInput, type MetadataDto, type SavedFilterDto,
} from "@todalo/server/metadata-input";
import { runFilterQuery } from "@todalo/server/filter-query";
import { filterAssistMessages, filterAssistSchema, parseFilterAssist } from "@todalo/server/filter-assist";
import { CoachModelError, type CoachConfig, type CoachModel } from "@todalo/server/coach";
import { writeUser } from "./project-routes";

type LabelRecord = { id: string; name: string; color: string | null; favorite?: boolean };
type Named = { id: string; name: string };

/** Shared @todalo/server/metadata operations; null/false means missing or another user's. */
export interface MetadataStore {
  verify(headers: Headers): Promise<string | null>;
  allowedOrigins: ReadonlySet<string>;
  metadata(userId: string): Promise<{ labels: LabelRecord[]; filters: SavedFilterDto[] }>;
  label(userId: string, id: string): Promise<LabelRecord | null>;
  filter(userId: string, id: string): Promise<SavedFilterDto | null>;
  /** Every task of the user, labels included (getTasksForUser). */
  tasks(userId: string): Promise<TaskRecord[]>;
  /** null: the client-chosen ID belongs to another user. */
  createLabel(userId: string, input: LabelInput & { id: string }): Promise<{ label: LabelRecord; created: boolean } | null>;
  updateLabel(userId: string, id: string, input: LabelInput): Promise<LabelRecord | null>;
  removeLabel(userId: string, id: string): Promise<boolean>;
  /** Throw MissingReferenceError when the definition names a label/project the user lacks. */
  createFilter(userId: string, input: FilterInput & { id: string }): Promise<{ filter: SavedFilterDto; created: boolean } | null>;
  updateFilter(userId: string, id: string, input: FilterInput): Promise<SavedFilterDto | null>;
  removeFilter(userId: string, id: string): Promise<boolean>;
  /** Names a query can refer to (#project, /section); labels come from metadata(). */
  projects(userId: string): Promise<Named[]>;
  sections(userId: string): Promise<Named[]>;
  /** Filter Assist reuses the Coach's provider; without one the card explains how to connect it. */
  coach?: { provider(userId: string): Promise<CoachConfig | null>; model(config: CoachConfig): CoachModel };
}

const UNAUTHENTICATED = { code: "UNAUTHENTICATED", message: "Please sign in again." } as const;
const LABEL_NOT_FOUND = { code: "NOT_FOUND", message: "This label does not exist or you do not have access to it." } as const;
const FILTER_NOT_FOUND = { code: "NOT_FOUND", message: "This filter does not exist or you do not have access to it." } as const;
const FORBIDDEN = { code: "FORBIDDEN_ORIGIN", message: "This request was not sent by todalo." } as const;
const INVALID = { code: "INVALID_INPUT", message: "Check your entry and try again." } as const;
const SAVE_FAILED = { code: "SAVE_FAILED", message: "Your changes could not be saved. Try again." } as const;

// Same envelope, ownership and write rules as project-routes.ts. Creates carry a
// client-generated UUID, so a retried create answers 200 with the original.
export function createMetadataRoutes(store: MetadataStore) {
  const reader = (request: Request) => store.verify(request.headers);
  const writer = (request: Request) => writeUser(store, request);
  return new Elysia({ prefix: "/api/v1" })
    .onBeforeHandle(({ set }) => { set.headers["cache-control"] = "no-store"; })
    // Malformed JSON and a filter naming a deleted or foreign label/project are invalid input.
    .onError(({ code, error, status }) => code === "PARSE" || error instanceof MissingReferenceError ? status(400, INVALID) : undefined)
    .get("/metadata", async ({ request, status }) => {
      const userId = await reader(request);
      if (!userId) return status(401, UNAUTHENTICATED);
      const { labels, filters } = await store.metadata(userId);
      return { labels: labels.map(toLabelDto), filters } satisfies MetadataDto;
    })
    .get("/labels/:id", async ({ request, params, status }) => {
      const userId = await reader(request);
      if (!userId) return status(401, UNAUTHENTICATED);
      const label = await store.label(userId, params.id);
      if (!label) return status(404, LABEL_NOT_FOUND);
      const tasks = (await store.tasks(userId)).filter(task => task.labelIds.includes(label.id));
      return { label: toLabelDto(label), tasks: tasks.map(toTaskDto) } satisfies LabelDetailDto;
    })
    .post("/labels", async ({ request, body, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      const input = labelCreateRequest.safeParse(body);
      if (!input.success) return status(400, INVALID);
      const result = await store.createLabel(userId, input.data);
      if (!result) return status(409, SAVE_FAILED);
      return status(result.created ? 201 : 200, { label: toLabelDto(result.label) satisfies LabelDto });
    })
    .patch("/labels/:id", async ({ request, params, body, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      const input = labelInput.safeParse(body);
      if (!input.success) return status(400, INVALID);
      const label = await store.updateLabel(userId, params.id, input.data);
      return label ? { label: toLabelDto(label) satisfies LabelDto } : status(404, LABEL_NOT_FOUND);
    })
    .delete("/labels/:id", async ({ request, params, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      return await store.removeLabel(userId, params.id) ? { id: params.id } : status(404, LABEL_NOT_FOUND);
    })
    .get("/filters/:id", async ({ request, params, status }) => {
      const userId = await reader(request);
      if (!userId) return status(401, UNAUTHENTICATED);
      const filter = await store.filter(userId, params.id);
      if (!filter) return status(404, FILTER_NOT_FOUND);
      // Evaluated here, in the server's zone, exactly as the legacy filter page.
      const now = new Date();
      const all = await store.tasks(userId);
      if (!filter.query) {
        const tasks = filter.definition ? all.filter(task => matchesSavedFilter(task, filter.definition!, now)) : [];
        return { filter, tasks: tasks.map(toTaskDto) } satisfies FilterDetailDto;
      }
      const [{ labels }, projects, sections] = await Promise.all([store.metadata(userId), store.projects(userId), store.sections(userId)]);
      const groups = runFilterQuery(filter.query, all, { now, labels, projects, sections }).map(group => ({ title: group.title, tasks: group.tasks.map(toTaskDto) }));
      const union = new Set(groups.flatMap(group => group.tasks.map(task => task.id)));
      return { filter, tasks: all.filter(task => union.has(task.id)).map(toTaskDto), groups } satisfies FilterDetailDto;
    })
    // Filter Assist: one model call; the reply is offered only if the parser accepts it.
    .post("/filters/assist", async ({ request, body, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      const input = filterAssistInput.safeParse(body);
      if (!input.success) return status(400, INVALID);
      const config = await store.coach?.provider(userId) ?? null;
      if (!config || !store.coach) return { query: null, message: "Connect the Coach in Settings › Coach to use Filter Assist." } satisfies FilterAssistDto;
      const [{ labels }, projects, sections] = await Promise.all([store.metadata(userId), store.projects(userId), store.sections(userId)]);
      const names = { labels: labels.map(item => item.name), projects: projects.map(item => item.name), sections: [...new Set(sections.map(item => item.name))] };
      try {
        const reply = await store.coach.model(config).complete({ messages: filterAssistMessages(input.data.description, names), schema: filterAssistSchema }, request.signal);
        return parseFilterAssist(reply) satisfies FilterAssistDto;
      } catch (error) {
        if (error instanceof CoachModelError) return { query: null, message: error.message } satisfies FilterAssistDto;
        throw error;
      }
    })
    .post("/filters", async ({ request, body, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      const input = filterCreateRequest.safeParse(body);
      if (!input.success) return status(400, INVALID);
      const result = await store.createFilter(userId, input.data);
      if (!result) return status(409, SAVE_FAILED);
      return status(result.created ? 201 : 200, { filter: result.filter satisfies SavedFilterDto });
    })
    .patch("/filters/:id", async ({ request, params, body, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      const input = filterInput.safeParse(body);
      if (!input.success) return status(400, INVALID);
      const filter = await store.updateFilter(userId, params.id, input.data);
      return filter ? { filter: filter satisfies SavedFilterDto } : status(404, FILTER_NOT_FOUND);
    })
    .delete("/filters/:id", async ({ request, params, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      return await store.removeFilter(userId, params.id) ? { id: params.id } : status(404, FILTER_NOT_FOUND);
    });
}
