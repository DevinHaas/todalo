import { z } from "zod";
import { startOfDay, isSameDay } from "date-fns";

export const taskMetadataSchema = z.object({
  priority: z.number().int().min(1).max(4).optional(),
  deadline: z.coerce.date().nullable().optional(),
  labelIds: z.array(z.string().min(1)).max(50).optional(),
}).strict();
export const filterDefinitionSchema = z.object({
  priority: z.number().int().min(1).max(4).nullable().optional(),
  labelId: z.string().min(1).nullable().optional(),
  projectId: z.string().min(1).nullable().optional(),
  status: z.enum(["any", "open", "done"]).default("open"),
  due: z.enum(["any", "today", "overdue", "undated"]).default("any"),
}).strict();
export type FilterDefinition = z.infer<typeof filterDefinitionSchema>;
export function matchesSavedFilter(task: { priority: number; labelIds?: string[]; projectId: string | null; status: string; dueDate: Date | string | null }, filter: FilterDefinition, now = new Date()) {
  if (filter.priority && task.priority !== filter.priority) return false;
  if (filter.labelId && !task.labelIds?.includes(filter.labelId)) return false;
  if (filter.projectId && task.projectId !== filter.projectId) return false;
  if (filter.status === "open" && task.status === "done" || filter.status === "done" && task.status !== "done") return false;
  const date = task.dueDate ? new Date(task.dueDate) : null;
  if (filter.due === "today" && (!date || !isSameDay(date, now))) return false;
  if (filter.due === "overdue" && (!date || date >= startOfDay(now))) return false;
  if (filter.due === "undated" && date) return false;
  return true;
}
