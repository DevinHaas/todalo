import { addDays, addWeeks, addMonths, addYears } from "date-fns";
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
