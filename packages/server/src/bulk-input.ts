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

/** Place one task directly before or after another task of the same collection. */
export const reorderInput = z.object({ anchorId: id, position: z.enum(["before", "after"]) }).strict();
export type ReorderPosition = z.infer<typeof reorderInput>["position"];

/** `completed`: written now or by an earlier attempt of this tap; `changed`: edited, completed or removed elsewhere. */
export interface BulkCompletionDto { completed: string[]; changed: string[] }

/**
 * The collection order after moving `id` next to `anchorId`. Relative to the
 * current order (not the client's copy), so a retry is a no-op and another
 * device's moves of other tasks are kept. null when either task is not in it.
 */
export function planReorder(order: readonly string[], id: string, anchorId: string, position: ReorderPosition): string[] | null {
  if (id === anchorId || !order.includes(id) || !order.includes(anchorId)) return null;
  const rest = order.filter(item => item !== id);
  const at = rest.indexOf(anchorId) + (position === "after" ? 1 : 0);
  return [...rest.slice(0, at), id, ...rest.slice(at)];
}
