// Goals ticket 13: one goal's week for the Weekly review, as a pure function
// (no database imports, so ticket 15's goal status and ticket 20's Coach reuse
// it per week). A task's time is its own start to end; nothing else is stored.
import type { ProgressRating } from "./ritual-dto";

/** The task fields a week summary reads. */
export interface WeekTask {
  id: string; projectId: string | null; status: "todo" | "in_progress" | "done";
  dueDate: Date | null; dueDateEnd: Date | null; completedAt: Date | null;
}
export interface WeekLinks { projects: { goalId: string; projectId: string }[]; tasks: { goalId: string; taskId: string }[] }
export interface WeekGoalSummary {
  goalId: string;
  /** The daily ratings (Evening review, and older Check-in) given for days of this week, oldest first. */
  checkIns: { day: string; rating: ProgressRating }[];
  /** Goal-linked tasks completed during the week. */
  completed: number;
  /** Minutes of goal-linked tasks scheduled (with a time of day) in the week. */
  scheduledMinutes: number;
  /** Of those, the minutes on tasks that are done. A passed, open one was planned but not kept. */
  keptMinutes: number;
}

const DEFAULT_MINUTES = 30;
const MIN_MINUTES = 15;

/** Same rule as the schedule grid (client durationOf): its own range within a day, else 30 minutes. */
export function taskMinutes(task: Pick<WeekTask, "dueDate" | "dueDateEnd">) {
  const minutes = task.dueDate && task.dueDateEnd ? (task.dueDateEnd.getTime() - task.dueDate.getTime()) / 60_000 : 0;
  return minutes >= MIN_MINUTES && minutes <= 24 * 60 ? minutes : DEFAULT_MINUTES;
}

/** A task is scheduled when its start has a time of day on the user's clock (midnight is all day). */
export function hasTimeIn(date: Date, zone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
  return parts !== "00:00";
}

export const serves = (task: Pick<WeekTask, "id" | "projectId">, goalId: string, links: WeekLinks) =>
  links.tasks.some(link => link.goalId === goalId && link.taskId === task.id)
  || (task.projectId !== null && links.projects.some(link => link.goalId === goalId && link.projectId === task.projectId));

/**
 * Each goal's week from `from` (inclusive) to `to` (exclusive), in goal order.
 * ponytail: a recurring task keeps one row, so it counts its latest completion
 * and current occurrence only; per-occurrence history would need a completions table.
 */
export function summariseWeek({ goalIds, links, tasks, checkIns, from, to, zone }: {
  goalIds: string[]; links: WeekLinks; tasks: WeekTask[];
  checkIns: { goalId: string; day: string; rating: ProgressRating }[];
  from: Date; to: Date; zone: string;
}): WeekGoalSummary[] {
  const within = (date: Date | null) => date !== null && date >= from && date < to;
  return goalIds.map(goalId => {
    const own = tasks.filter(task => serves(task, goalId, links));
    const scheduled = own.filter(task => within(task.dueDate) && hasTimeIn(task.dueDate!, zone));
    const minutes = (list: WeekTask[]) => list.reduce((sum, task) => sum + taskMinutes(task), 0);
    return {
      goalId,
      checkIns: checkIns.filter(item => item.goalId === goalId).map(({ day, rating }) => ({ day, rating })).sort((a, b) => a.day.localeCompare(b.day)),
      completed: own.filter(task => task.status === "done" && within(task.completedAt)).length,
      scheduledMinutes: minutes(scheduled),
      keptMinutes: minutes(scheduled.filter(task => task.status === "done")),
    };
  });
}
