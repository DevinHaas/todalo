// In-memory twin of @todalo/server/metadata for route tests and the isolated QA
// API: same owner checks, ID replay and legacy reference rules, no database.
// Deleting a label removes it from tasks (schema cascade) but keeps filters.
import type { MetadataStore } from "../src/metadata-routes";
import { MissingReferenceError, toSavedFilterDto, type FilterDefinition } from "../../../packages/server/src/metadata-input";
import type { TaskRecord } from "../../../packages/server/src/task-dto";

export type MemoryLabel = { id: string; userId: string; name: string; color: string | null };
export type MemoryFilter = { id: string; userId: string; name: string; definition: unknown };

export function memoryMetadataStore(options: {
  verify: MetadataStore["verify"];
  allowedOrigins: ReadonlySet<string>;
  labels: MemoryLabel[];
  filters: MemoryFilter[];
  projects: { id: string; userId: string }[];
  tasks: (TaskRecord & { userId: string })[];
}): MetadataStore {
  const { labels, filters, projects, tasks } = options;
  const label = (userId: string, id: string) => labels.find(item => item.userId === userId && item.id === id) ?? null;
  const filter = (userId: string, id: string) => filters.find(item => item.userId === userId && item.id === id) ?? null;
  const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);
  const references = (userId: string, definition: FilterDefinition) => {
    if (definition.labelId && !label(userId, definition.labelId)) throw new MissingReferenceError();
    if (definition.projectId && !projects.some(item => item.userId === userId && item.id === definition.projectId)) throw new MissingReferenceError("Project not found");
  };
  const remove = <T extends { userId: string; id: string }>(rows: T[], userId: string, id: string) => {
    const index = rows.findIndex(item => item.userId === userId && item.id === id);
    if (index >= 0) rows.splice(index, 1);
    return index >= 0;
  };
  return {
    verify: options.verify,
    allowedOrigins: options.allowedOrigins,
    metadata: async (userId) => ({
      labels: labels.filter(item => item.userId === userId).sort(byName),
      filters: filters.filter(item => item.userId === userId).sort(byName).map(toSavedFilterDto),
    }),
    label: async (userId, id) => label(userId, id),
    filter: async (userId, id) => { const row = filter(userId, id); return row && toSavedFilterDto(row); },
    tasks: async (userId) => tasks.filter(task => task.userId === userId),
    createLabel: async (userId, { id, name, color }) => {
      const existing = labels.find(item => item.id === id);
      if (existing) return existing.userId === userId ? { label: existing, created: false } : null;
      const row = { id, userId, name, color: color ?? null };
      labels.push(row);
      return { label: row, created: true };
    },
    updateLabel: async (userId, id, { name, color }) => {
      const row = label(userId, id);
      if (row) Object.assign(row, { name }, color !== undefined && { color });
      return row;
    },
    removeLabel: async (userId, id) => {
      if (!remove(labels, userId, id)) return false;
      for (const task of tasks) if (task.userId === userId) task.labelIds = task.labelIds.filter(item => item !== id);
      return true;
    },
    createFilter: async (userId, { id, name, definition }) => {
      references(userId, definition);
      const existing = filters.find(item => item.id === id);
      if (existing) return existing.userId === userId ? { filter: toSavedFilterDto(existing), created: false } : null;
      const row = { id, userId, name, definition };
      filters.push(row);
      return { filter: toSavedFilterDto(row), created: true };
    },
    updateFilter: async (userId, id, { name, definition }) => {
      references(userId, definition);
      const row = filter(userId, id);
      if (row) Object.assign(row, { name, definition });
      return row && toSavedFilterDto(row);
    },
    removeFilter: async (userId, id) => remove(filters, userId, id),
  };
}
