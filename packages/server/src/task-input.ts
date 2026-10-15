// Pure validation schemas (zod only, no database) so client bundles may import them.
import { z } from "zod";
import { recurrenceSchema } from "@todalo/ramble/recurrence";

export const taskMetadataSchema = z.object({
  priority: z.number().int().min(1).max(4).optional(),
  deadline: z.coerce.date().nullable().optional(),
  labelIds: z.array(z.string().min(1)).max(50).optional(),
}).strict();

export const taskInput = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  projectId: z.string().min(1).nullable().optional(),
  sectionId: z.string().min(1).nullable().optional(),
  parentId: z.string().min(1).nullable().optional(),
  status: z.enum(["todo", "in_progress", "done"]).optional(),
  dueDate: z.coerce.date().nullable().optional(),
  dueDateEnd: z.coerce.date().nullable().optional(),
  recurrence: recurrenceSchema.nullable().optional(),
}).extend(taskMetadataSchema.shape);

export const createTaskInput = taskInput.extend({
  // Client-generated task ID: the operation ID that makes a retried create
  // (after an ambiguous response) return the original task instead of a copy.
  id: z.uuid().optional(),
  placement: z.object({ edge: z.enum(["top", "bottom", "above", "below"]), anchorId: z.string().optional() }).optional(),
});
export type CreateTaskInput = z.input<typeof createTaskInput>;

/** The basic task the shared client can create (ticket 5): Today or Inbox, no rich fields. */
export const basicTaskInput = z.object({
  id: z.uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
  dueDate: z.iso.datetime({ offset: true }).nullable().optional(),
});
export type BasicTaskInput = z.infer<typeof basicTaskInput>;

/** `occurrence`: the due date the client saw, so a replay cannot advance a recurrence twice. */
export const completionInput = z.object({ occurrence: z.iso.datetime({ offset: true }).nullable().optional() }).optional();
