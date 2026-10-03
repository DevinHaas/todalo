import { format } from "date-fns";
import { Hash, Inbox } from "lucide-react";
import { hasDueTime } from "@/lib/task-dates";

export function DatePill({ dueDate, overdue = false }: { dueDate: Date | string; overdue?: boolean }) {
  const date = new Date(dueDate);
  return <span className={overdue ? "text-xs font-medium text-destructive" : "text-xs text-muted-foreground"}>
    {format(date, hasDueTime(date) ? "d MMM HH:mm" : "d MMM")}
  </span>;
}

export function ProjectPill({ name = "Inbox", color }: { name?: string; color?: string | null }) {
  const Icon = name === "Inbox" ? Inbox : Hash;
  return <span className="flex items-center gap-1 text-xs text-muted-foreground">
    <Icon className="size-3.5" style={color ? { color } : undefined} />{name}
  </span>;
}
