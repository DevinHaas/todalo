import { addDays, startOfDay } from "date-fns";

export type ViewDateAction = "today" | "next-week" | "previous-week";
export function navigateViewDate(anchor: Date, action: ViewDateAction, today = new Date()): Date {
  return action === "today" ? startOfDay(today) : addDays(anchor, action === "next-week" ? 7 : -7);
}

const layouts = ["list", "board", "calendar"] as const;
export function nextLayout(layout: typeof layouts[number], direction = 1) {
  return layouts[(layouts.indexOf(layout) + direction + layouts.length) % layouts.length];
}
