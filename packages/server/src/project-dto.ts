// Client-safe JSON contract for projects. Pure: no database imports, so the
// shared client may import these types.
import type { TaskDto } from "./task-dto";

export interface ProjectDto { id: string; name: string; color: string | null }
export interface ProjectsDto { projects: ProjectDto[] }
/** A project with its member tasks (all statuses; the client hides completed ones). */
export interface ProjectDetailDto { project: ProjectDto; tasks: TaskDto[] }

export interface ProjectRecord { id: string; name: string; color: string | null }

/** Allow-lists fields: user IDs and creation internals never leave the server. */
export const toProjectDto = (project: ProjectRecord): ProjectDto => ({ id: project.id, name: project.name, color: project.color });

/** Legacy rule (apps/web projects/actions.ts): trimmed name, 1–200 characters. */
export function parseProjectName(body: unknown): string | null {
  const name = typeof body === "object" && body !== null ? (body as { name?: unknown }).name : undefined;
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  return trimmed.length >= 1 && trimmed.length <= 200 ? trimmed : null;
}
