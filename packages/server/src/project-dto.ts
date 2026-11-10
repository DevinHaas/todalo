// Client-safe JSON contract for projects. Pure: no database imports, so the
// shared client may import these types.
import { z } from "zod";
import type { TaskDto } from "./task-dto";

/**
 * A project's Display settings (Todoist's per-project Display popover), saved
 * on the project. Stored as given; `parseProjectDisplay` fills what is missing.
 */
export const projectDisplay = z.object({
  layout: z.enum(["list", "board", "calendar", "table"]),
  showCompleted: z.boolean(),
  calendarRange: z.enum(["week", "month"]),
  grouping: z.enum(["none", "date", "deadline", "added", "priority", "label"]),
  sorting: z.enum(["manual", "date", "deadline", "added", "priority", "name"]),
  date: z.enum(["all", "today", "week", "overdue", "none"]),
  deadline: z.enum(["all", "week", "overdue", "any", "none"]),
  created: z.enum(["all", "today", "week", "month"]),
  priority: z.enum(["all", "1", "2", "3", "4"]),
  /** "all" or one of the user's label IDs. */
  label: z.string().min(1).max(200),
}).strict();
export type ProjectDisplay = z.infer<typeof projectDisplay>;
export const defaultProjectDisplay: ProjectDisplay = {
  layout: "list", showCompleted: false, calendarRange: "month", grouping: "none", sorting: "manual",
  date: "all", deadline: "all", created: "all", priority: "all", label: "all",
};
/** A stored value (possibly from an older client, or null) as complete settings. */
export function parseProjectDisplay(value: unknown): ProjectDisplay {
  const parsed = projectDisplay.partial().strip().safeParse(value ?? {});
  return { ...defaultProjectDisplay, ...parsed.success ? parsed.data : {} };
}

export interface ProjectDto {
  id: string; name: string; color: string | null;
  /** Todoist's project description (up to 16,383 characters); null when empty. */
  description: string | null;
  /** Shown under the sidebar's Favorites. */
  favorite: boolean;
  /** Archived projects leave the sidebar and are listed under My Projects' "Archived projects only". */
  archived: boolean;
  display: ProjectDisplay;
}
/** My Projects' columns: tasks completed and still open (sub-tasks included). */
export interface ProjectSummaryDto extends ProjectDto { completedCount: number; openCount: number }
export interface ProjectsDto { projects: ProjectSummaryDto[] }
export interface SectionDto { id: string; projectId: string; name: string }
/** A project with its sections (legacy order) and member tasks (all statuses; the client hides completed ones). */
export interface ProjectDetailDto { project: ProjectDto; sections: SectionDto[]; tasks: TaskDto[] }
/** Everything a task can be moved to (legacy getOrganizationDestinations); Inbox is implicit. */
export interface DestinationsDto { projects: Pick<ProjectDto, "id" | "name">[]; sections: SectionDto[] }

export interface ProjectRecord {
  id: string; name: string; color: string | null;
  // Optional so rows from before migration 0045 (and test doubles) still map.
  description?: string | null; favorite?: boolean | null; archivedAt?: Date | null; viewSettings?: unknown;
  completedCount?: number; openCount?: number;
}

/** Allow-lists fields: user IDs and creation internals never leave the server. */
export const toProjectDto = (project: ProjectRecord): ProjectDto => ({
  id: project.id, name: project.name, color: project.color, description: project.description ?? null,
  favorite: project.favorite ?? false, archived: Boolean(project.archivedAt), display: parseProjectDisplay(project.viewSettings),
});
export const toProjectSummaryDto = (project: ProjectRecord): ProjectSummaryDto => ({
  ...toProjectDto(project), completedCount: project.completedCount ?? 0, openCount: project.openCount ?? 0,
});
export const toSectionDto = (section: SectionDto): SectionDto => ({ id: section.id, projectId: section.projectId, name: section.name });

const name = z.string().trim().min(1).max(200);
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const DESCRIPTION_MAX = 16_383;
/** Add project: name (legacy rule: trimmed, 1–200), optional colour and favorite. Other keys are dropped (legacy). */
export const projectCreateInput = z.object({ name, color: hexColor.nullable().optional(), favorite: z.boolean().optional() });
export type ProjectCreateInput = z.infer<typeof projectCreateInput>;
/** Edit, favorite, archive, the description and Display: only the fields sent change. */
export const projectUpdateInput = z.object({
  name: name.optional(),
  color: hexColor.nullable().optional(),
  // An empty description is stored as null.
  description: z.string().max(DESCRIPTION_MAX).transform(value => value.trim() ? value : null).nullable().optional(),
  favorite: z.boolean().optional(),
  archived: z.boolean().optional(),
  display: projectDisplay.optional(),
}).strict().refine(input => Object.keys(input).length > 0, { message: "Nothing to change" });
export type ProjectUpdateInput = z.infer<typeof projectUpdateInput>;

/** Legacy rule (apps/web projects/actions.ts): trimmed name, 1–200 characters. */
export function parseProjectName(body: unknown): string | null {
  const value = typeof body === "object" && body !== null ? (body as { name?: unknown }).name : undefined;
  const parsed = name.safeParse(value);
  return parsed.success ? parsed.data : null;
}
