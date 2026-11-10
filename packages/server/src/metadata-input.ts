// Client-safe label and saved-filter contract (zod only, no database), moved
// from apps/web/lib/task-metadata.ts and the legacy metadata actions so both
// hosts parse and evaluate saved filters with one set of rules.
import { z } from "zod";
import type { TaskDto } from "./task-dto";
import { FILTER_QUERY_MAX, filterQueryError } from "./filter-query";

/** Stored as `saved_filters.definition` (jsonb). Legacy rows omit defaults, so
 * parsing (not the raw row) is what every reader must use. */
export const filterDefinitionSchema = z.object({
  priority: z.number().int().min(1).max(4).nullable().optional(),
  labelId: z.string().min(1).nullable().optional(),
  projectId: z.string().min(1).nullable().optional(),
  status: z.enum(["any", "open", "done"]).default("open"),
  due: z.enum(["any", "today", "overdue", "undated"]).default("any"),
}).strict();
export type FilterDefinition = z.infer<typeof filterDefinitionSchema>;

const startOfDay = (date: Date) => { const day = new Date(date); day.setHours(0, 0, 0, 0); return day; };
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Legacy semantics: every chosen condition must match; days are the evaluating
 * process's local days (the server's, as the legacy filter page). */
export function matchesSavedFilter(task: { priority: number; labelIds?: string[]; projectId: string | null; status: string; dueDate?: Date | string | null }, filter: FilterDefinition, now = new Date()) {
  if (filter.priority && task.priority !== filter.priority) return false;
  if (filter.labelId && !task.labelIds?.includes(filter.labelId)) return false;
  if (filter.projectId && task.projectId !== filter.projectId) return false;
  if (filter.status === "open" && task.status === "done" || filter.status === "done" && task.status !== "done") return false;
  const date = task.dueDate ? new Date(task.dueDate) : null;
  if (filter.due === "today" && (!date || !sameDay(date, now))) return false;
  if (filter.due === "overdue" && (!date || date >= startOfDay(now))) return false;
  if (filter.due === "undated" && date) return false;
  return true;
}

/** A label (or a filter's label/project) that is missing — deleted — or another
 * user's. Pure so route modules can map it to 400 without the database. */
export class MissingReferenceError extends Error {
  constructor(message = "Label not found") { super(message); this.name = "MissingReferenceError"; }
}

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);
/** Legacy labelInput plus the favorite switch (omitted: unchanged); `id` is the client-generated create operation ID. */
export const labelInput = z.object({
  name: z.string().trim().min(1).max(100),
  color: hexColor.nullable().optional(),
  favorite: z.boolean().optional(),
}).strict();
export const newLabelInput = labelInput.extend({ id: z.uuid().optional() });
export type LabelInput = z.infer<typeof labelInput>;

/** A Todoist-style query (filter-query.ts); invalid ones are refused. */
export const filterQuery = z.string().trim().min(1).max(FILTER_QUERY_MAX).refine(query => filterQueryError(query) === null, "Invalid filter query");
/**
 * Legacy filterInput (name + definition) or a query filter (name + query and
 * the optional Todoist fields). Saving a query clears the stored definition;
 * omitted optional fields stay as they were.
 */
const filterFields = z.object({
  name: z.string().trim().min(1).max(100),
  definition: filterDefinitionSchema.optional(),
  query: filterQuery.optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  color: hexColor.nullable().optional(),
  favorite: z.boolean().optional(),
}).strict();
const oneKind = (input: { definition?: unknown; query?: unknown }) => (input.definition === undefined) !== (input.query === undefined);
export const filterInput = filterFields.refine(oneKind, "Send a query or a definition");
export const newFilterInput = filterFields.extend({ id: z.uuid().optional() }).refine(oneKind, "Send a query or a definition");
/** API create bodies: the client always generates the operation ID. */
export const labelCreateRequest = labelInput.extend({ id: z.uuid() });
export const filterCreateRequest = filterFields.extend({ id: z.uuid() }).refine(oneKind, "Send a query or a definition");
export type FilterInput = z.infer<typeof filterInput>;

export interface LabelDto { id: string; name: string; color: string | null; favorite: boolean }
/** Exactly one of `query` (current) and `definition` (ticket 14, evaluated with its own rules) is set. */
export interface SavedFilterDto {
  id: string; name: string; query: string | null; definition: FilterDefinition | null;
  description: string | null; color: string | null; favorite: boolean;
}
/** Legacy getMetadata without projects (the client reads /projects). Both sorted by name. */
export interface MetadataDto { labels: LabelDto[]; filters: SavedFilterDto[] }
/** Legacy /labels/:id and /filters/:id: every matching task, completed included. */
export interface LabelDetailDto { label: LabelDto; tasks: TaskDto[] }
export interface FilterDetailDto {
  filter: SavedFilterDto; tasks: TaskDto[];
  /** Query filters: one list per comma-separated part, titled by its text (`tasks` is their union). */
  groups?: { title: string; tasks: TaskDto[] }[];
}

/** Filter Assist: a description in, a query the parser accepts out (or why not). */
export const filterAssistInput = z.object({ description: z.string().trim().min(1).max(500) }).strict();
export type FilterAssistDto = { query: string } | { query: null; message: string };

type LabelRow = { id: string; name: string; color: string | null; favorite?: boolean | null };
type FilterRow = { id: string; name: string; definition?: unknown; query?: string | null; description?: string | null; color?: string | null; favorite?: boolean | null };
export const toLabelDto = (label: LabelRow): LabelDto => ({ id: label.id, name: label.name, color: label.color, favorite: label.favorite ?? false });
export const toSavedFilterDto = (filter: FilterRow): SavedFilterDto => ({
  id: filter.id, name: filter.name,
  // A row with a query is a query filter; every other row is a legacy definition (parsed, never rewritten).
  query: filter.query ?? null, definition: filter.query ? null : filterDefinitionSchema.parse(filter.definition),
  description: filter.description ?? null, color: filter.color ?? null, favorite: filter.favorite ?? false,
});
/** Columns a filter write sets: a query clears the definition and a definition clears the query. */
export function filterColumns(input: FilterInput) {
  const { definition, query, ...rest } = input;
  return { ...rest, ...query !== undefined ? { query, definition: null } : { definition, query: null } };
}
