import type { Task } from "../../apps/web/lib/tasks";
import type { CalendarEvent } from "../../apps/web/lib/calendar-events";

export const baselineNow = "2026-10-04T10:00:00.000Z";
export const baselineUser = { name: "Alex Example", email: "alex@example.invalid", image: null };
const base: Task = {
  id: "fixture-overdue", userId: "fixture-user", projectId: null, parentId: null,
  sectionId: null, title: "Review the migration checklist", description: null,
  priority: 2, deadline: null, status: "todo", dueDate: new Date("2026-10-03T10:00:00Z"),
  dueDateEnd: null, recurrence: null, sortOrder: 0, googleCalendarEventId: null,
  completedAt: null, createdAt: new Date("2026-10-01T10:00:00Z"), updatedAt: new Date("2026-10-01T10:00:00Z"), labelIds: [],
};
export const baselineTasks: Task[] = [
  base,
  { ...base, id: "fixture-today", title: "Plan the first shared screen", priority: 4, sortOrder: 1, dueDate: new Date("2026-10-04T12:30:00Z"), labelIds: ["fixture-label"] },
  { ...base, id: "fixture-tomorrow", title: "Prepare tomorrow's review", priority: 4, sortOrder: 2, dueDate: new Date("2026-10-05T08:00:00Z") },
  { ...base, id: "fixture-completed", title: "Confirm the query boundary", status: "done", sortOrder: 3, dueDate: new Date("2026-10-04T08:00:00Z") },
  { ...base, id: "fixture-undated", title: "Unscheduled idea", dueDate: null, sortOrder: 4 },
];
export const baselineEvents: CalendarEvent[] = [{
  id: "fixture-event", title: "Planning check-in", start: new Date("2026-10-04T09:00:00Z"),
  end: new Date("2026-10-04T09:30:00Z"), allDay: false, htmlLink: null, color: "#4285f4",
}];
