// Client-safe label and saved-filter contract (zod only, no database), moved
// from apps/web/lib/task-metadata.ts and the legacy metadata actions so both
// hosts parse and evaluate saved filters with one set of rules.
import { z } from "zod";
import type { TaskDto } from "./task-dto";

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

/** Legacy labelInput; `id` is the client-generated create operation ID. */
export const labelInput = z.object({
  name: z.string().trim().min(1).max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
}).strict();
export const newLabelInput = labelInput.extend({ id: z.uuid().optional() });
export type LabelInput = z.infer<typeof labelInput>;

/** Legacy filterInput without the id (the route carries it). */
export const filterInput = z.object({ name: z.string().trim().min(1).max(100), definition: filterDefinitionSchema }).strict();
export const newFilterInput = filterInput.extend({ id: z.uuid().optional() });
/** API create bodies: the client always generates the operation ID. */
export const labelCreateRequest = labelInput.extend({ id: z.uuid() });
export const filterCreateRequest = filterInput.extend({ id: z.uuid() });
export type FilterInput = z.infer<typeof filterInput>;

export interface LabelDto { id: string; name: string; color: string | null }
export interface SavedFilterDto { id: string; name: string; definition: FilterDefinition }
/** Legacy getMetadata without projects (the client reads /projects). Both sorted by name. */
export interface MetadataDto { labels: LabelDto[]; filters: SavedFilterDto[] }
/** Legacy /labels/:id and /filters/:id: every matching task, completed included. */
export interface LabelDetailDto { label: LabelDto; tasks: TaskDto[] }
export interface FilterDetailDto { filter: SavedFilterDto; tasks: TaskDto[] }

export const toLabelDto = (label: { id: string; name: string; color: string | null }): LabelDto => ({ id: label.id, name: label.name, color: label.color });
export const toSavedFilterDto = (filter: { id: string; name: string; definition: unknown }): SavedFilterDto => ({
  id: filter.id, name: filter.name, definition: filterDefinitionSchema.parse(filter.definition),
});
