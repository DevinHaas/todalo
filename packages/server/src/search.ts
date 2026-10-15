// Legacy search semantics (apps/web /search page and the Quick Find dialog).
// Pure on purpose: the legacy client dialog, the API and the QA server import it.
import type { TaskDto } from "./task-dto";

/** The /search page reads at most this much of `q` (longer input is cut, not rejected). */
export const SEARCH_QUERY_MAX = 200;
/** Quick Find lists at most this many matches. */
export const FIND_LIMIT = 40;

export const searchQuery = (value: unknown) => (typeof value === "string" ? value : "").slice(0, SEARCH_QUERY_MAX);

const folds = (text: string, query: string) => text.toLocaleLowerCase().includes(query.toLocaleLowerCase());

/** /search: case-insensitive substring of "title description", in the given (sortOrder) order. Empty matches all. */
export function searchTasks<T extends { title: string; description: string | null }>(tasks: readonly T[], query: string): T[] {
  return tasks.filter(task => folds(`${task.title} ${task.description ?? ""}`, query));
}

export interface FindItem { id: string; title: string; href: string; kind: "Task" | "Project" | "Section" }
export interface FindDto { items: FindItem[] }
/** `GET /api/v1/search?q=`: the query as applied (cut to 200) and the matches. */
export interface SearchDto { query: string; tasks: TaskDto[] }

/** Quick Find candidates in legacy order: tasks (sortOrder), projects (name), sections (sortOrder, name). */
export function findItems(
  tasks: readonly { id: string; title: string }[],
  projects: readonly { id: string; name: string }[],
  sections: readonly { id: string; projectId: string; name: string }[],
): FindItem[] {
  return [
    ...tasks.map(task => ({ id: task.id, title: task.title, href: `/tasks/${encodeURIComponent(task.id)}`, kind: "Task" as const })),
    ...projects.map(project => ({ id: project.id, title: project.name, href: `/projects/${project.id}`, kind: "Project" as const })),
    ...sections.map(section => ({ id: section.id, title: section.name, href: `/projects/${section.projectId}#section-${section.id}`, kind: "Section" as const })),
  ];
}

/** Quick Find: title-only substring match, first FIND_LIMIT; `sectionsOnly` is the "Navigate sections" mode. */
export function matchFindItems(items: readonly FindItem[], query: string, sectionsOnly = false): FindItem[] {
  return items.filter(item => (!sectionsOnly || item.kind === "Section") && folds(item.title, query)).slice(0, FIND_LIMIT);
}
