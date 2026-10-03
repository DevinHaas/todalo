// Pure recognizer for smart quick-add: turns date/time/recurrence language
// typed into a task title into structured matches, independent of any UI.
// See docs/adr/0002-quick-add-highlighting-technique.md for how callers are
// expected to render `matches` and CONTEXT.md's "Matched phrase" entry.

import { addDays, isBefore, startOfDay, startOfWeek } from "date-fns";
import type { Recurrence } from "@/lib/recurrence";

export type QuickAddMatchKind = "date" | "time" | "recurrence";

export interface QuickAddMatch {
  start: number;
  end: number;
  text: string;
  kind: QuickAddMatchKind;
}

export interface ParseQuickAddResult {
  matches: QuickAddMatch[];
  strippedTitle: string;
  dueDate: Date | null;
  startTime: string | null;
  endTime: string | null;
  recurrence: Recurrence | null;
}

interface TimeValue {
  start: string;
  end: string | null;
  duration?: number;
}

interface Candidate {
  start: number;
  end: number;
  kind: QuickAddMatchKind;
  value: Date | string | Recurrence | TimeValue;
}

const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

const MONTHS: Record<string, number> = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
};

const RECURRENCE_UNIT_WORDS: Record<string, Recurrence["unit"]> = {
  day: "day",
  days: "day",
  week: "week",
  weeks: "week",
  month: "month",
  months: "month",
  year: "year",
  years: "year",
};

function resolveWeekday(reference: Date, targetDow: number): Date {
  const today = startOfDay(reference);
  const diff = (targetDow - today.getDay() + 7) % 7;
  return addDays(today, diff);
}

// Explicit dates carry no year, so pick the closest occurrence on or after
// today — rolling into next year once this year's date has already passed.
function resolveYearRollover(reference: Date, month: number, day: number): Date {
  const today = startOfDay(reference);
  const candidate = new Date(today.getFullYear(), month, day);
  if (isBefore(candidate, today)) {
    return new Date(today.getFullYear() + 1, month, day);
  }
  return candidate;
}

function nextWeekStart(reference: Date): Date {
  const thisWeekStart = startOfWeek(startOfDay(reference), { weekStartsOn: 1 });
  return addDays(thisWeekStart, 7);
}

function to24Hour(hour12: number, meridiem: string): number {
  const isPM = meridiem.toLowerCase() === "pm";
  const h = hour12 % 12;
  return isPM ? h + 12 : h;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

// Normalizes an hour/minute/optional-meridiem capture into "HH:MM". Without
// a meridiem the hour is read as 24-hour (bare "19:30"); with one it's 12-hour.
function normalizeTime(hourStr: string, minStr: string | undefined, meridiem: string | undefined): string | null {
  const hour = parseInt(hourStr, 10);
  const minute = minStr ? parseInt(minStr, 10) : 0;
  if (minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    return `${pad(to24Hour(hour, meridiem))}:${pad(minute)}`;
  }
  if (hour < 0 || hour > 23) return null;
  return `${pad(hour)}:${pad(minute)}`;
}

function addMinutesToTime(time: string, minutesToAdd: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = ((h * 60 + m + minutesToAdd) % 1440 + 1440) % 1440;
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

function dailyRecurrence(unit: Recurrence["unit"], n = 1): Recurrence {
  return { n, unit, basedOn: "scheduled", until: null };
}

function collectCandidates(text: string, reference: Date): Candidate[] {
  const candidates: Candidate[] = [];
  const push = (m: RegExpExecArray, kind: QuickAddMatchKind, value: Date | string | Recurrence | TimeValue) => {
    candidates.push({ start: m.index, end: m.index + m[0].length, kind, value });
  };

  let m: RegExpExecArray | null;

  const nextWeekRe = /\bnext week\b/gi;
  while ((m = nextWeekRe.exec(text))) push(m, "date", nextWeekStart(reference));

  const todayRe = /\b(?:today|tod)\b/gi;
  while ((m = todayRe.exec(text))) push(m, "date", startOfDay(reference));

  const tomorrowRe = /\b(?:tomorrow|tom)\b/gi;
  while ((m = tomorrowRe.exec(text))) push(m, "date", addDays(startOfDay(reference), 1));

  const weekdayRe =
    /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|wed|thu|fri|sat)\b/gi;
  while ((m = weekdayRe.exec(text))) {
    push(m, "date", resolveWeekday(reference, WEEKDAYS[m[1].toLowerCase()]));
  }

  const monthDayRe =
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})\b/gi;
  while ((m = monthDayRe.exec(text))) {
    const day = parseInt(m[2], 10);
    if (day >= 1 && day <= 31) {
      push(m, "date", resolveYearRollover(reference, MONTHS[m[1].toLowerCase()], day));
    }
  }

  const numericDateRe = /\b(\d{1,2})[./](\d{1,2})\b/g;
  while ((m = numericDateRe.exec(text))) {
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10) - 1;
    if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
      push(m, "date", resolveYearRollover(reference, month, day));
    }
  }

  // Order matters here only in that longer matches win overlaps regardless
  // (see resolveOverlaps) — a range/duration phrase always out-lengths the
  // bare single-time phrase it contains, so it's picked automatically.

  // Include the introducing word in the highlight and stripped phrase.
  // A colon or meridiem anchors the start so plain "4 to 5" stays text.
  // Keep invalid anchored ranges together rather than recognizing just
  // one endpoint as a standalone time.
  const invalidTimeRanges: { start: number; end: number }[] = [];
  const timeRangeRe =
    /(?<![\w:])(?:(?:at|from)\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|until|to)\s*(\d{1,2})(?::(\d{2}))?(?:\s*(am|pm))?\b(?![\w:])/gi;
  while ((m = timeRangeRe.exec(text))) {
    if (!m[2] && !m[3]) continue;
    const start = normalizeTime(m[1], m[2], m[3]);
    const end = start ? normalizeTime(m[4], m[5], m[6]) : null;
    if (start && end) push(m, "time", { start, end });
    else invalidTimeRanges.push({ start: m.index, end: m.index + m[0].length });
  }
  const overlapsInvalidRange = (match: RegExpExecArray) => invalidTimeRanges.some(
    (range) => match.index < range.end && match.index + match[0].length > range.start,
  );

  // "19:30 for 30min", "7:30pm for 1h"
  const timeForDurationRe =
    /\b(?:at\s+)?(\d{1,2}):(\d{2})\s*(am|pm)?\s+for\s+(\d+)\s*(min|mins|minutes|h|hr|hrs|hours)\b/gi;
  while ((m = timeForDurationRe.exec(text))) {
    if (overlapsInvalidRange(m)) continue;
    const start = normalizeTime(m[1], m[2], m[3]);
    if (!start) continue;
    const n = parseInt(m[4], 10);
    const minutes = m[5].toLowerCase().startsWith("h") ? n * 60 : n;
    push(m, "time", { start, end: addMinutesToTime(start, minutes) });
  }

  // Single 12-hour times need only their meridiem, not an introducing word
  // or a duration: "4pm", "4:30pm", "at 7:30pm".
  const timeRe = /(?<![\w:])(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b(?![\w:])/gi;
  while ((m = timeRe.exec(text))) {
    if (overlapsInvalidRange(m)) continue;
    const start = normalizeTime(m[1], m[2], m[3]);
    if (start) push(m, "time", { start, end: null });
  }

  // Bare 24-hour clock time, "at" optional: "19:30", "at 19:30"
  const bareTimeRe = /(?<![\w:])(?:at\s+)?(\d{1,2}):(\d{2})(?![\w:]|\s*(?:am|pm)\b)/gi;
  while ((m = bareTimeRe.exec(text))) {
    if (overlapsInvalidRange(m)) continue;
    const start = normalizeTime(m[1], m[2], undefined);
    if (start) push(m, "time", { start, end: null });
  }

  // An explicit "at" also anchors an hour-only number: "at 4", "at 16".
  // Do not extract an hour from a longer or invalid clock token.
  const hourTimeRe = /(?<![\w:])at\s+(\d{1,2})\b(?![\w:]|[./]\d|\s*(?:am|pm)\b)/gi;
  while ((m = hourTimeRe.exec(text))) {
    if (overlapsInvalidRange(m)) continue;
    const start = normalizeTime(m[1], undefined, undefined);
    if (start) push(m, "time", { start, end: null });
  }

  // A duration that isn't touching its time, e.g. "19:00 today for 1h" —
  // timeForDurationRe above only catches "for" immediately after the time.
  // Resolve against the accepted start after rejection and overlap handling.
  // Where this overlaps timeForDurationRe's own match, resolveOverlaps drops
  // it in favor of that longer, already-complete candidate.
  const standaloneDurationRe = /\bfor\s+(\d+)\s*(min|mins|minutes|h|hr|hrs|hours)\b/gi;
  while ((m = standaloneDurationRe.exec(text))) {
    const n = parseInt(m[1], 10);
    const minutes = m[2].toLowerCase().startsWith("h") ? n * 60 : n;
    push(m, "time", { start: "", end: null, duration: minutes });
  }

  const namedRecurrenceRe = /\b(daily|weekly|monthly)\b/gi;
  while ((m = namedRecurrenceRe.exec(text))) {
    const unit = m[1].toLowerCase() === "daily" ? "day" : m[1].toLowerCase() === "weekly" ? "week" : "month";
    push(m, "recurrence", dailyRecurrence(unit));
  }

  const everyUnitRe = /\bevery\s+(day|week|month|year)\b/gi;
  while ((m = everyUnitRe.exec(text))) {
    push(m, "recurrence", dailyRecurrence(m[1].toLowerCase() as Recurrence["unit"]));
  }

  const everyNRe = /\bevery\s+(\d+)\s+(days?|weeks?|months?|years?)\b/gi;
  while ((m = everyNRe.exec(text))) {
    const n = parseInt(m[1], 10);
    if (n > 0) push(m, "recurrence", dailyRecurrence(RECURRENCE_UNIT_WORDS[m[2].toLowerCase()], n));
  }

  return candidates;
}

// Longest match wins on overlaps; ties break toward the earlier start so
// results are deterministic regardless of rule declaration order.
function resolveOverlaps(candidates: Candidate[]): Candidate[] {
  const byLengthDesc = [...candidates].sort((a, b) => {
    const lengthDiff = b.end - b.start - (a.end - a.start);
    return lengthDiff !== 0 ? lengthDiff : a.start - b.start;
  });

  const accepted: Candidate[] = [];
  for (const candidate of byLengthDesc) {
    const overlaps = accepted.some((a) => candidate.start < a.end && candidate.end > a.start);
    if (!overlaps) accepted.push(candidate);
  }

  return accepted.sort((a, b) => a.start - b.start);
}

function stripMatches(text: string, matches: Candidate[]): string {
  let result = "";
  let cursor = 0;
  for (const match of matches) {
    result += text.slice(cursor, match.start);
    cursor = match.end;
  }
  result += text.slice(cursor);
  return result.replace(/\s+/g, " ").trim();
}

export interface ParseQuickAddOptions {
  // Excludes a candidate from highlighting and from the derived fields below
  // — how click-to-reject un-highlights a match for the rest of a compose
  // session without persisting anything. See CONTEXT.md's "Matched phrase".
  isRejected?: (match: QuickAddMatch) => boolean;
}

export function parseQuickAdd(
  text: string,
  referenceDate: Date = new Date(),
  options: ParseQuickAddOptions = {},
): ParseQuickAddResult {
  const isRejected = options.isRejected ?? (() => false);
  let accepted = resolveOverlaps(collectCandidates(text, referenceDate)).filter(
    (c) => !isRejected({ start: c.start, end: c.end, kind: c.kind, text: text.slice(c.start, c.end) }),
  );

  const dateMatch = accepted.find((c) => c.kind === "date");
  const recurrenceMatch = accepted.find((c) => c.kind === "recurrence");

  // A time can be split across two matches — a standalone start ("19:00")
  // and a detached duration ("for 1h") elsewhere in the title — so merge
  // across every accepted "time" candidate rather than reading just the
  // first. `accepted` is start-position sorted, so the first truthy value
  // of each is the earliest-written one.
  const timeValues = accepted.filter((c) => c.kind === "time").map((c) => c.value as TimeValue);
  const startTime = timeValues.map((v) => v.start).find(Boolean) ?? null;
  const endTime = timeValues
    .map((v) => v.duration !== undefined && startTime ? addMinutesToTime(startTime, v.duration) : v.end)
    .find(Boolean) ?? null;
  if (!startTime) {
    accepted = accepted.filter((c) => c.kind !== "time" || (c.value as TimeValue).duration === undefined);
  }

  return {
    matches: accepted.map((c) => ({ start: c.start, end: c.end, kind: c.kind, text: text.slice(c.start, c.end) })),
    strippedTitle: stripMatches(text, accepted),
    dueDate: dateMatch ? (dateMatch.value as Date) : null,
    startTime,
    endTime,
    recurrence: recurrenceMatch ? (recurrenceMatch.value as Recurrence) : null,
  };
}

// The Settings > General > "Smart date recognition" toggle gates parsing at
// this single choke point — callers (TaskQuickAdd, TaskComposer) route every
// parse through here instead of branching on `enabled` themselves.
export function parseQuickAddOrPlain(
  text: string,
  enabled: boolean,
  referenceDate?: Date,
  options: ParseQuickAddOptions = {},
): ParseQuickAddResult {
  if (!enabled) {
    return { matches: [], strippedTitle: text.trim(), dueDate: null, startTime: null, endTime: null, recurrence: null };
  }
  return parseQuickAdd(text, referenceDate, options);
}
