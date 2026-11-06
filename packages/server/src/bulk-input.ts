// Pure bulk-action and reorder schemas plus the reorder planner (zod only, no
// database) so the shared client and the QA API can import them.
import { z } from "zod";

const id = z.string().min(1).max(128);
const isoDate = z.iso.datetime({ offset: true });

/** Legacy selection limit (bulkTaskAction / bulkTaskMetadata): 1–200 task IDs. */
export const bulkIds = z.array(id).min(1).max(200);

/** One completion per selected task: the due date the client saw, and one tap ID for the whole selection. */
export const bulkCompleteInput = z.object({
  operationId: z.uuid(),
  tasks: z.array(z.object({ id, occurrence: isoDate.nullable() }).strict()).min(1).max(200),
  /** Goals ticket 06: the user confirmed completing milestones with open done criteria (ticks them all). */
  confirmCriteria: z.boolean().optional(),
}).strict();
export type BulkCompleteInput = z.infer<typeof bulkCompleteInput>;

/** Delete and clear-date take only the selection. */
export const bulkIdsInput = z.object({ ids: bulkIds }).strict();

/** Legacy bulk metadata picker: one field at a time; labels replace every task's set. */
export const bulkMetadataInput = z.object({
  ids: bulkIds,
  priority: z.number().int().min(1).max(4).optional(),
  deadline: isoDate.nullable().optional(),
  labelIds: z.array(id).max(50).optional(),
}).strict().refine(input => input.priority !== undefined || input.deadline !== undefined || input.labelIds !== undefined, { message: "Choose a change" });
export type BulkMetadataInput = z.infer<typeof bulkMetadataInput>;
export type BulkMetadataChange = Omit<BulkMetadataInput, "ids">;

/** Legacy multi-task move (organization moveTasks); Inbox is `projectId: null` with no section. */
export const bulkMoveInput = z.object({ ids: bulkIds, projectId: id.nullable(), sectionId: id.nullable() }).strict()
  .refine(move => move.projectId !== null || move.sectionId === null, { path: ["sectionId"], message: "Inbox has no sections" });

/**
 * Place one task directly before or after another task of the same collection,
 * and/or set its status (ticket 17, legacy status board). A status without an
 * anchor appends the task to the end of its collection, as the legacy board did.
 */
export const reorderInput = z.object({ anchorId: id.optional(), position: z.enum(["before", "after"]).optional(), status: z.enum(["todo", "in_progress", "done"]).optional(),
  /** Goals ticket 06: confirms a drop into Done of a milestone with open done criteria (ticks them all). */
  confirmCriteria: z.boolean().optional() }).strict()
  .refine(move => (move.anchorId === undefined) === (move.position === undefined), { path: ["position"], message: "An anchor needs a position" })
  .refine(move => move.anchorId !== undefined || move.status !== undefined, { message: "Choose a place or a status" });
export type ReorderInput = z.infer<typeof reorderInput>;
export type ReorderPosition = "before" | "after";
export type TaskStatus = NonNullable<ReorderInput["status"]>;

/** `completed`: written now or by an earlier attempt of this tap; `changed`: edited, completed or removed elsewhere. */
export interface BulkCompletionDto { completed: string[]; changed: string[] }

/**
 * The collection order after moving `id` next to `anchorId`. Relative to the
 * current order (not the client's copy), so a retry is a no-op and another
 * device's moves of other tasks are kept. A null anchor moves `id` to the end
 * (a status board drop). null when either task is not in it.
 */
export function planReorder(order: readonly string[], id: string, anchorId: string | null, position: ReorderPosition = "after"): string[] | null {
  if (id === anchorId || !order.includes(id) || (anchorId !== null && !order.includes(anchorId))) return null;
  const rest = order.filter(item => item !== id);
  const at = anchorId === null ? rest.length : rest.indexOf(anchorId) + (position === "after" ? 1 : 0);
  return [...rest.slice(0, at), id, ...rest.slice(at)];
}
