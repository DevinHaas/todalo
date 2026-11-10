// In-memory twin of @todalo/server/metadata for route tests and the isolated QA
// API: same owner checks, ID replay and legacy reference rules, no database.
// Deleting a label removes it from tasks (schema cascade) but keeps filters.
import type { MetadataStore } from "../src/metadata-routes";
import { filterColumns, MissingReferenceError, toLabelDto, toSavedFilterDto, type FilterDefinition } from "../../../packages/server/src/metadata-input";
import type { TaskRecord } from "../../../packages/server/src/task-dto";

export type MemoryLabel = { id: string; userId: string; name: string; color: string | null; favorite?: boolean };
export type MemoryFilter = {
  id: string; userId: string; name: string; definition: unknown;
  query?: string | null; description?: string | null; color?: string | null; favorite?: boolean;
};

export function memoryMetadataStore(options: {
  verify: MetadataStore["verify"];
  allowedOrigins: ReadonlySet<string>;
  labels: MemoryLabel[];
  filters: MemoryFilter[];
  projects: { id: string; userId: string; name?: string }[];
  sections?: { id: string; userId: string; name: string }[];
  tasks: (TaskRecord & { userId: string })[];
  coach?: MetadataStore["coach"];
}): MetadataStore {
  const { labels, filters, projects, tasks, sections = [] } = options;
  const label = (userId: string, id: string) => labels.find(item => item.userId === userId && item.id === id) ?? null;
  const filter = (userId: string, id: string) => filters.find(item => item.userId === userId && item.id === id) ?? null;
  const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);
  const references = (userId: string, definition: FilterDefinition | undefined) => {
    if (!definition) return;
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
      labels: labels.filter(item => item.userId === userId).sort(byName).map(toLabelDto),
      filters: filters.filter(item => item.userId === userId).sort(byName).map(toSavedFilterDto),
    }),
    label: async (userId, id) => { const row = label(userId, id); return row && toLabelDto(row); },
    filter: async (userId, id) => { const row = filter(userId, id); return row && toSavedFilterDto(row); },
    tasks: async (userId) => tasks.filter(task => task.userId === userId),
    createLabel: async (userId, { id, name, color, favorite }) => {
      const existing = labels.find(item => item.id === id);
      if (existing) return existing.userId === userId ? { label: toLabelDto(existing), created: false } : null;
      const row = { id, userId, name, color: color ?? null, favorite: favorite ?? false };
      labels.push(row);
      return { label: toLabelDto(row), created: true };
    },
    updateLabel: async (userId, id, { name, color, favorite }) => {
      const row = label(userId, id);
      if (row) Object.assign(row, { name }, color !== undefined && { color }, favorite !== undefined && { favorite });
      return row && toLabelDto(row);
    },
    removeLabel: async (userId, id) => {
      if (!remove(labels, userId, id)) return false;
      for (const task of tasks) if (task.userId === userId) task.labelIds = task.labelIds.filter(item => item !== id);
      return true;
    },
    createFilter: async (userId, { id, ...input }) => {
      references(userId, input.definition);
      const existing = filters.find(item => item.id === id);
      if (existing) return existing.userId === userId ? { filter: toSavedFilterDto(existing), created: false } : null;
      const row = { id, userId, ...filterColumns(input) };
      filters.push(row);
      return { filter: toSavedFilterDto(row), created: true };
    },
    updateFilter: async (userId, id, input) => {
      references(userId, input.definition);
      const row = filter(userId, id);
      // As drizzle's set(): omitted (undefined) fields keep their stored value.
      if (row) Object.assign(row, Object.fromEntries(Object.entries(filterColumns(input)).filter(([, value]) => value !== undefined)));
      return row && toSavedFilterDto(row);
    },
    removeFilter: async (userId, id) => remove(filters, userId, id),
    projects: async (userId) => projects.filter(item => item.userId === userId).map(item => ({ id: item.id, name: item.name ?? item.id })),
    sections: async (userId) => sections.filter(item => item.userId === userId),
    coach: options.coach,
  };
}
