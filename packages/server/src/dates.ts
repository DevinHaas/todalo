// Resolve a browser calendar date/time in its IANA zone, rather than letting
// the server's timezone shift a task to a different day. This also applies
// the correct daylight-saving offset for the captured future date.
export function zonedTaskDate(day: string | null, time: string | null, zone: string): Date | null {
  if (!day) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || (time && !/^\d{2}:\d{2}$/.test(time))) {
    throw new Error("Invalid captured date");
  }
  const [year, month, date] = day.split("-").map(Number);
  const [hour, minute] = (time ?? "00:00").split(":").map(Number);
  const wallTime = Date.UTC(year, month - 1, date, hour, minute);
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  let instant = wallTime;
  for (let i = 0; i < 3; i++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map((part) => [part.type, part.value]));
    const observed = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
    const correction = wallTime - observed;
    if (!correction) return new Date(instant);
    instant += correction;
  }
  // A nonexistent spring-forward clock time cannot be silently moved.
  throw new Error("This clock time does not exist in your timezone. Remove the task and capture it again.");
}
