import { addDays, addWeeks, addMonths, addYears, isAfter } from "date-fns";
import { z } from "zod";

export const recurrenceSchema = z.object({
  n: z.number().int().positive(),
  unit: z.enum(["day", "week", "month", "year"]),
  basedOn: z.enum(["scheduled", "completed"]),
  until: z.coerce.date().nullish(),
});

export type Recurrence = z.infer<typeof recurrenceSchema>;

export function getNextDueDate(current: Date, recurrence: Recurrence): Date {
  switch (recurrence.unit) {
    case "day":
      return addDays(current, recurrence.n);
    case "week":
      return addWeeks(current, recurrence.n);
    case "month":
      return addMonths(current, recurrence.n);
    case "year":
      return addYears(current, recurrence.n);
  }
}

// The next-occurrence computation actually used at task completion:
// `basedOn: "completed"` advances from the completion timestamp rather than
// `dueDate`, and a passed `until` stops the recurrence (returns null) instead
// of generating another occurrence.
export function nextOccurrenceOnCompletion(
  dueDate: Date | null,
  completedAt: Date,
  recurrence: Recurrence,
): Date | null {
  const base = recurrence.basedOn === "completed" ? completedAt : (dueDate ?? completedAt);
  const next = getNextDueDate(base, recurrence);
  if (recurrence.until && isAfter(next, recurrence.until)) return null;
  return next;
}
