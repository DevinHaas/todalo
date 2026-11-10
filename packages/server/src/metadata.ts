// Server-only label and saved-filter operations shared by the legacy metadata
// actions and /api/v1. Transports authenticate before supplying userId; every
// read and write is owner-scoped, so a foreign ID behaves like a missing one.
import { and, eq } from "drizzle-orm";
import { db } from "@todalo/db";
import { labels, savedFilters } from "@todalo/db/schema";
import { assertOwnedLabels } from "./task-labels";
import { getOwnedProject } from "./projects";
import { MissingReferenceError, filterColumns, filterInput, labelInput, newFilterInput, newLabelInput, toLabelDto, toSavedFilterDto, type FilterDefinition, type FilterInput, type LabelInput } from "./metadata-input";

/** A client-chosen create ID that already belongs to another user. */
export class MetadataIdConflictError extends Error {
  constructor() { super("This ID is already in use."); this.name = "MetadataIdConflictError"; }
}

const labelColumns = { id: labels.id, name: labels.name, color: labels.color, favorite: labels.favorite };
const filterSelect = {
  id: savedFilters.id, name: savedFilters.name, definition: savedFilters.definition, query: savedFilters.query,
  description: savedFilters.description, color: savedFilters.color, favorite: savedFilters.favorite,
};

export async function getMetadataForUser(userId: string) {
  const [userLabels, filters] = await Promise.all([
    db.select(labelColumns).from(labels).where(eq(labels.userId, userId)).orderBy(labels.sortOrder, labels.name),
    db.select(filterSelect).from(savedFilters).where(eq(savedFilters.userId, userId)).orderBy(savedFilters.sortOrder, savedFilters.name),
  ]);
  return { labels: userLabels.map(toLabelDto), filters: filters.map(toSavedFilterDto) };
}

/** null for missing and other users' labels alike. */
export async function getOwnedLabel(userId: string, id: string) {
  const [label] = await db.select(labelColumns).from(labels).where(and(eq(labels.id, id), eq(labels.userId, userId))).limit(1);
  return label ? toLabelDto(label) : null;
}

/** null for missing and other users' filters alike; the definition is parsed (legacy rows omit defaults). */
export async function getOwnedFilter(userId: string, id: string) {
  const [filter] = await db.select(filterSelect).from(savedFilters).where(and(eq(savedFilters.id, id), eq(savedFilters.userId, userId))).limit(1);
  return filter ? toSavedFilterDto(filter) : null;
}

/** A replayed `id` answers with the original label (created: false). */
export async function createLabel(userId: string, input: LabelInput & { id?: string }) {
  const { id, ...data } = newLabelInput.parse(input);
  const [label] = await db.insert(labels).values({ ...(id && { id }), userId, ...data }).onConflictDoNothing().returning();
  if (label) return { label: toLabelDto(label), created: true };
  const existing = id ? await getOwnedLabel(userId, id) : null;
  if (!existing) throw new MetadataIdConflictError();
  return { label: existing, created: false };
}

/** An omitted color is preserved (legacy). */
export async function updateLabel(userId: string, id: string, input: LabelInput) {
  const data = labelInput.parse(input);
  const [label] = await db.update(labels).set(data).where(and(eq(labels.id, id), eq(labels.userId, userId))).returning();
  return label ? toLabelDto(label) : null;
}

/** The schema cascades task_labels: tasks keep everything but this label.
 * Saved filters naming it are kept and then match no task (legacy). */
export async function deleteLabel(userId: string, id: string) {
  const deleted = await db.delete(labels).where(and(eq(labels.id, id), eq(labels.userId, userId))).returning();
  return deleted.length > 0;
}

/** Legacy saveFilter rule: a filter may only name the owner's label and project.
 * Queries name labels and projects by name, so an unknown name just matches nothing. */
async function assertOwnedReferences(userId: string, definition: FilterDefinition | undefined) {
  if (!definition) return;
  if (definition.labelId) await assertOwnedLabels(userId, [definition.labelId]);
  if (definition.projectId && !await getOwnedProject(userId, definition.projectId)) throw new MissingReferenceError("Project not found");
}

export async function createFilter(userId: string, input: FilterInput & { id?: string }) {
  const { id, ...data } = newFilterInput.parse(input);
  await assertOwnedReferences(userId, data.definition);
  const [filter] = await db.insert(savedFilters).values({ ...(id && { id }), userId, ...filterColumns(data) }).onConflictDoNothing().returning();
  if (filter) return { filter: toSavedFilterDto(filter), created: true };
  const existing = id ? await getOwnedFilter(userId, id) : null;
  if (!existing) throw new MetadataIdConflictError();
  return { filter: existing, created: false };
}

export async function updateFilter(userId: string, id: string, input: FilterInput) {
  const data = filterInput.parse(input);
  await assertOwnedReferences(userId, data.definition);
  const [filter] = await db.update(savedFilters).set(filterColumns(data)).where(and(eq(savedFilters.id, id), eq(savedFilters.userId, userId))).returning();
  return filter ? toSavedFilterDto(filter) : null;
}

export async function deleteFilter(userId: string, id: string) {
  const deleted = await db.delete(savedFilters).where(and(eq(savedFilters.id, id), eq(savedFilters.userId, userId))).returning();
  return deleted.length > 0;
}
