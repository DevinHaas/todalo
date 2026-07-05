import { addDays, addWeeks, addMonths } from "date-fns";
import { z } from "zod";

export const recurrenceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("daily") }),
  z.object({ type: z.literal("weekly") }),
  z.object({ type: z.literal("monthly") }),
  z.object({ type: z.literal("every_n_days"), n: z.number().int().positive() }),
]);

export type Recurrence = z.infer<typeof recurrenceSchema>;

export function getNextDueDate(current: Date, recurrence: Recurrence): Date {
  switch (recurrence.type) {
    case "daily":
      return addDays(current, 1);
    case "weekly":
      return addWeeks(current, 1);
    case "monthly":
      return addMonths(current, 1);
    case "every_n_days":
      return addDays(current, recurrence.n);
  }
}
