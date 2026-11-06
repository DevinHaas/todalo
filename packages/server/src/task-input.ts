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

/** ADR 0001 recurrence as the shared client sends it (`until` ISO or null). */
const recurrenceInput = z.object({
  n: z.number().int().positive().max(1000),
  unit: z.enum(["day", "week", "month", "year"]),
  basedOn: z.enum(["scheduled", "completed"]),
  until: z.iso.datetime({ offset: true }).nullable().optional(),
}).strict();

/**
 * The task the shared client can create: Today or Inbox (ticket 5), plus the
 * end time and repeat smart quick add detects (ticket 12) and the composer's
 * project, metadata and placement. An end time without a due date is refused by the route.
 */
export const basicTaskInput = z.object({
  id: z.uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
  dueDate: z.iso.datetime({ offset: true }).nullable().optional(),
  dueDateEnd: z.iso.datetime({ offset: true }).nullable().optional(),
  recurrence: recurrenceInput.nullable().optional(),
  // Composer metadata and destination (legacy TaskComposer): project/section,
  // the Additional actions fields, and where a keyboard or "Save and add" insert goes.
  projectId: z.string().min(1).max(200).nullable().optional(),
  sectionId: z.string().min(1).max(200).nullable().optional(),
  /** "Add sub-task": the new task joins this parent's project and section. */
  parentId: z.string().min(1).max(200).nullable().optional(),
  priority: z.number().int().min(1).max(4).optional(),
  deadline: z.iso.datetime({ offset: true }).nullable().optional(),
  labelIds: z.array(z.string().min(1).max(200)).max(50).optional(),
  placement: z.object({ edge: z.enum(["top", "bottom", "above", "below"]), anchorId: z.string().min(1).max(200).optional() }).strict().optional(),
});
export type BasicTaskInput = z.infer<typeof basicTaskInput>;

/** The legacy edit (Server Action and @todalo/server updateTask): any task field by ID. */
export const updateTaskInput = taskInput.partial().extend({ id: z.string() });
export type UpdateTaskInput = z.infer<typeof updateTaskInput>;

const isoDate = z.iso.datetime({ offset: true });
/**
 * Task details the shared client edits (ticket 11): the legacy edit dialog
 * without labels/organization (tickets 13/14). Every field is sent, as the
 * legacy dialog did, so `dueDate` always triggers the calendar push.
 * `updatedAt` is the copy the editor started from (stale-edit check).
 */
export const taskDetailsInput = z.object({
  updatedAt: isoDate,
  title: z.string().trim().min(1).max(500),
  description: z.string().max(10_000),
  priority: z.number().int().min(1).max(4),
  deadline: isoDate.nullable(),
  dueDate: isoDate.nullable(),
  dueDateEnd: isoDate.nullable(),
  recurrence: recurrenceInput.nullable(),
  // Ticket 14: the dialog's label checkboxes (the full set; [] clears). Optional
  // so older clients keep labels; deleted or foreign IDs answer 400.
  labelIds: z.array(z.string().min(1).max(200)).max(50).optional(),
}).strict().refine(details => details.dueDate !== null || details.dueDateEnd === null, { path: ["dueDateEnd"], message: "An end time needs a due date" });
export type TaskDetailsInput = z.infer<typeof taskDetailsInput>;

/**
 * `occurrence`: the due date the client saw; `operationId`: generated per tap and
 * reused on its retries, so a replay is recognised and a stale tap is refused.
 */
export const completionInput = z.object({ occurrence: isoDate.nullable().optional(), operationId: z.uuid().optional() }).optional();
