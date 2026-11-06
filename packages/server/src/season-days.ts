// Goals ticket 04: a season's day count ("Day 52 of 84") as a pure function of
// calendar dates, so it never depends on the server's timezone.

/** Before the start, running (day 1..length), or past its last day (until ended in ticket 05). */
export type SeasonPhase = "upcoming" | "running" | "over";
export interface SeasonProgress { phase: SeasonPhase; day: number; length: number; daysLeft: number; startsIn: number }

const DAY = 86_400_000;
const epochDay = (date: string) => Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) / DAY;

/** Today's calendar date (YYYY-MM-DD) in an IANA zone, as the user's own clock shows it. */
export function todayIn(zone: string, now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(now).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Day 1 is the start date; days left excludes today (the last day has 0 left). */
export function seasonProgress(startDate: string, length: number, today: string): SeasonProgress {
  const day = epochDay(today) - epochDay(startDate) + 1;
  if (day < 1) return { phase: "upcoming", day: 0, length, daysLeft: length, startsIn: 1 - day };
  if (day > length) return { phase: "over", day: length, length, daysLeft: 0, startsIn: 0 };
  return { phase: "running", day, length, daysLeft: length - day, startsIn: 0 };
}
