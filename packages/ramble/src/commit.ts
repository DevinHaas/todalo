import { z } from "zod";

// A Ramble commit as the client sends it over HTTP (ticket 21): the staged
// todos the socket last published, the capture timezone, and the session's
// client-generated operation ID. The server derives every task ID from the
// operation ID, so a replay after an ambiguous response cannot duplicate tasks.
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();
const clock = z.string().regex(/^\d{2}:\d{2}$/).nullable();
const stagedId = z.string().min(1).max(64);

export const rambleTodoInput = z.object({
  id: stagedId,
  title: z.string().max(4000),
  parentId: stagedId.nullable(),
  dueDate: day,
  startTime: clock,
  endTime: clock,
  recurrence: z.object({
    n: z.number().int().positive().max(1000),
    unit: z.enum(["day", "week", "month", "year"]),
    basedOn: z.enum(["scheduled", "completed"]),
    until: z.iso.datetime({ offset: true }).nullable(),
  }).strict().nullable(),
  projectId: z.string().min(1).max(200).nullable(),
}).strict();

export const rambleOperationId = z.uuid();

export const rambleCommitInput = z.object({
  operationId: rambleOperationId,
  timeZone: z.string().min(1).max(64).refine((zone) => {
    try { new Intl.DateTimeFormat("en", { timeZone: zone }); return true; } catch { return false; }
  }),
  todos: z.array(rambleTodoInput).min(1).max(500),
}).strict();

export type RambleCommitInput = z.infer<typeof rambleCommitInput>;
