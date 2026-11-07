// Client-safe JSON contract and input rules for time blocks (goals ticket 07;
// zod only, no database imports, so the shared client may import these).
// A block is reserved time with an optional goal. Scheduled tasks are not
// blocks here: the client presents each as a block holding just that task.
import { z } from "zod";

/** Goals ticket 09: what became of one block (one occurrence). */
export const blockOutcomes = ["planned", "done", "skipped", "rescheduled"] as const;
export type BlockOutcome = typeof blockOutcomes[number];

/** Instants are ISO strings, like task dates. taskIds in the order they were put in (ticket 08); outcome and how often it was rescheduled (09). */
export interface TimeBlockDto { id: string; goalId: string | null; title: string | null; start: string; end: string; taskIds: string[]; outcome: BlockOutcome; rescheduleCount: number }
export interface TimeBlocksDto { blocks: TimeBlockDto[] }

/** googleCalendarEventId (ticket 10) is server-only and never in the DTO. */
export interface TimeBlockRecord { id: string; goalId: string | null; title: string | null; startAt: Date; endAt: Date; taskIds: string[]; outcome: BlockOutcome; rescheduleCount: number; googleCalendarEventId?: string | null }
export const toTimeBlockDto = (block: TimeBlockRecord): TimeBlockDto => ({
  id: block.id, goalId: block.goalId, title: block.title, start: block.startAt.toISOString(), end: block.endAt.toISOString(), taskIds: block.taskIds,
  outcome: block.outcome, rescheduleCount: block.rescheduleCount,
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

/** Ticket 09: "rescheduled" adds one to the block's reschedule count every time it is sent; "planned" undoes done or skipped. */
export const blockOutcomeInput = z.object({ outcome: z.enum(blockOutcomes) }).strict();

/** Reserved and kept (done) minutes for one goal. */
export interface GoalTime { goalId: string; reservedMinutes: number; keptMinutes: number }
/**
 * Ticket 09: per goal, the minutes of its blocks inside [from, to) (a block
 * crossing an edge counts only its inside part) and how many of them were kept.
 * Blocks without a goal are left out; goals in first-block order.
 */
export function goalTime(blocks: Pick<TimeBlockDto, "goalId" | "start" | "end" | "outcome">[], from: Date, to: Date): GoalTime[] {
  const totals = new Map<string, GoalTime>();
  for (const block of blocks) {
    const minutes = (Math.min(Date.parse(block.end), to.getTime()) - Math.max(Date.parse(block.start), from.getTime())) / 60_000;
    if (!block.goalId || minutes <= 0) continue;
    const total = totals.get(block.goalId) ?? { goalId: block.goalId, reservedMinutes: 0, keptMinutes: 0 };
    total.reservedMinutes += minutes;
    if (block.outcome === "done") total.keptMinutes += minutes;
    totals.set(block.goalId, total);
  }
  return [...totals.values()];
}
