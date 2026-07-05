import { TaskRow } from "@/components/tasks/task-row";
import type { Task } from "@/lib/tasks";

function isToday(date: Date) {
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

export function ListView({ tasks }: { tasks: Task[] }) {
  const today = tasks.filter((t) => t.dueDate && isToday(new Date(t.dueDate)));
  const upcoming = tasks.filter((t) => t.dueDate && !isToday(new Date(t.dueDate)));
  const noDate = tasks.filter((t) => !t.dueDate);

  const buckets = [
    { label: "Today", items: today },
    { label: "Upcoming", items: upcoming },
    { label: "No date", items: noDate },
  ];

  return (
    <div className="space-y-6">
      {buckets.map(
        (bucket) =>
          bucket.items.length > 0 && (
            <section key={bucket.label}>
              <h2 className="mb-2 text-sm font-medium text-muted-foreground">
                {bucket.label}
              </h2>
              {bucket.items.map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
            </section>
          ),
      )}
    </div>
  );
}
