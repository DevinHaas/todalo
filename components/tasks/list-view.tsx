import { TaskRow } from "@/components/tasks/task-row";
import { EventRow } from "@/components/tasks/event-item";
import type { Task } from "@/lib/tasks";
import type { CalendarEvent } from "@/lib/calendar-events";

function isToday(date: Date) {
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

export function ListView({ tasks, events = [] }: { tasks: Task[]; events?: CalendarEvent[] }) {
  const today = tasks.filter((t) => t.dueDate && isToday(new Date(t.dueDate)));
  const upcoming = tasks.filter((t) => t.dueDate && !isToday(new Date(t.dueDate)));
  const noDate = tasks.filter((t) => !t.dueDate);
  const todayEvents = events.filter((e) => isToday(e.start));
  const upcomingEvents = events.filter((e) => !isToday(e.start));

  const buckets = [
    { label: "Today", items: today, events: todayEvents },
    { label: "Upcoming", items: upcoming, events: upcomingEvents },
    { label: "No date", items: noDate, events: [] as CalendarEvent[] },
  ];

  return (
    <div className="space-y-6">
      {buckets.map(
        (bucket) =>
          (bucket.items.length > 0 || bucket.events.length > 0) && (
            <section key={bucket.label}>
              <h2 className="mb-2 text-sm font-medium text-muted-foreground">
                {bucket.label}
              </h2>
              {bucket.events.map((event) => (
                <EventRow key={event.id} event={event} />
              ))}
              {bucket.items.map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
            </section>
          ),
      )}
    </div>
  );
}
