import { format } from "date-fns";
import type { CalendarEvent } from "@/lib/calendar-events";

// Imported Google Calendar events are read-only in this app — editing
// happens in Google Calendar (hence the plain <a> to htmlLink instead of
// the TaskEditDialog treatment tasks get).

export function EventRow({ event }: { event: CalendarEvent }) {
  return (
    <a
      href={event.htmlLink ?? undefined}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted/50"
    >
      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: event.color }} />
      <span className="min-w-0 flex-1 truncate">{event.title}</span>
      {!event.allDay && (
        <span className="shrink-0 text-xs text-muted-foreground">{format(event.start, "HH:mm")}</span>
      )}
    </a>
  );
}

const HOUR_HEIGHT = 48;

function offsetFor(date: Date) {
  return (date.getHours() + date.getMinutes() / 60) * HOUR_HEIGHT;
}

export function EventBlock({ event }: { event: CalendarEvent }) {
  const top = offsetFor(event.start);
  const height = Math.max(offsetFor(event.end) - top, 20);

  return (
    <a
      href={event.htmlLink ?? undefined}
      target="_blank"
      rel="noreferrer"
      className="absolute left-14 right-2 z-0 overflow-hidden rounded-md border-l-2 px-2 py-1 text-left"
      style={{
        top,
        height,
        borderColor: event.color,
        backgroundColor: `color-mix(in srgb, ${event.color} 15%, transparent)`,
      }}
    >
      <div className="truncate text-sm font-medium">{event.title}</div>
      <div className="text-xs text-muted-foreground">
        {format(event.start, "HH:mm")}–{format(event.end, "HH:mm")}
      </div>
    </a>
  );
}

export function EventChip({ event }: { event: CalendarEvent }) {
  return (
    <a
      href={event.htmlLink ?? undefined}
      target="_blank"
      rel="noreferrer"
      className="mb-1 flex items-center gap-1 truncate rounded px-1 py-0.5 text-left text-xs"
      style={{ backgroundColor: `color-mix(in srgb, ${event.color} 20%, transparent)` }}
    >
      <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: event.color }} />
      <span className="truncate">{event.title}</span>
    </a>
  );
}
