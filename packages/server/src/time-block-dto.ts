// Client-safe JSON contract and input rules for time blocks (goals ticket 07;
// zod only, no database imports, so the shared client may import these).
// A block is reserved time with an optional goal. Scheduled tasks are not
// blocks here: the client presents each as a block holding just that task.
import { z } from "zod";

/** Instants are ISO strings, like task dates. taskIds in the order they were put in (ticket 08); 09 adds the outcome, 10 the calendar event. */
export interface TimeBlockDto { id: string; goalId: string | null; title: string | null; start: string; end: string; taskIds: string[] }
export interface TimeBlocksDto { blocks: TimeBlockDto[] }

export interface TimeBlockRecord { id: string; goalId: string | null; title: string | null; startAt: Date; endAt: Date; taskIds: string[] }
export const toTimeBlockDto = (block: TimeBlockRecord): TimeBlockDto => ({
  id: block.id, goalId: block.goalId, title: block.title, start: block.startAt.toISOString(), end: block.endAt.toISOString(), taskIds: block.taskIds,
});

/** A block is at least 15 minutes (the schedule's snap) and at most a day. */
export const MIN_BLOCK_MS = 15 * 60_000;
export const MAX_BLOCK_MS = 24 * 60 * 60_000;
// instanceof: zod still runs the refinement when an instant itself failed to parse.
const validRange = ({ start, end }: { start?: Date; end?: Date }) =>
  !(start instanceof Date) || !(end instanceof Date) || (end.getTime() - start.getTime() >= MIN_BLOCK_MS && end.getTime() - start.getTime() <= MAX_BLOCK_MS);

const instant = z.iso.datetime({ offset: true }).transform(value => new Date(value));
// An empty title clears it.
const title = z.string().max(200).transform(value => value.trim() || null);
const goalId = z.string().min(1).max(200).nullable();

export const createTimeBlockInput = z.object({ start: instant, end: instant, goalId: goalId.optional(), title: title.optional() }).strict()
  .refine(validRange, { message: "A block is 15 minutes to 24 hours" });
/** Only the supplied fields change; a move or resize sends start and end together. */
export const updateTimeBlockInput = z.object({ start: instant.optional(), end: instant.optional(), goalId: goalId.optional(), title: title.optional() }).strict()
  .refine(patch => Object.keys(patch).length > 0, { message: "Nothing to change" })
  .refine(patch => (patch.start === undefined) === (patch.end === undefined), { message: "Send start and end together" })
  .refine(validRange, { message: "A block is 15 minutes to 24 hours" });

export type CreateTimeBlockInput = z.infer<typeof createTimeBlockInput>;
export type UpdateTimeBlockInput = z.infer<typeof updateTimeBlockInput>;
