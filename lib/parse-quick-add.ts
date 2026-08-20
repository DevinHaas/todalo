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
  recurrence: Recurrence | null;
}

interface Candidate {
  start: number;
  end: number;
  kind: QuickAddMatchKind;
  value: Date | string | Recurrence;
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

function dailyRecurrence(unit: Recurrence["unit"], n = 1): Recurrence {
  return { n, unit, basedOn: "scheduled", until: null };
}

function collectCandidates(text: string, reference: Date): Candidate[] {
  const candidates: Candidate[] = [];
  const push = (m: RegExpExecArray, kind: QuickAddMatchKind, value: Date | string | Recurrence) => {
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

  const timeRe = /\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/gi;
  while ((m = timeRe.exec(text))) {
    const hour = parseInt(m[1], 10);
    const minute = m[2] ? parseInt(m[2], 10) : 0;
    if (hour >= 1 && hour <= 12 && minute <= 59) {
      push(m, "time", `${pad(to24Hour(hour, m[3]))}:${pad(minute)}`);
    }
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
  const accepted = resolveOverlaps(collectCandidates(text, referenceDate)).filter(
    (c) => !isRejected({ start: c.start, end: c.end, kind: c.kind, text: text.slice(c.start, c.end) }),
  );

  const dateMatch = accepted.find((c) => c.kind === "date");
  const timeMatch = accepted.find((c) => c.kind === "time");
  const recurrenceMatch = accepted.find((c) => c.kind === "recurrence");

  return {
    matches: accepted.map((c) => ({ start: c.start, end: c.end, kind: c.kind, text: text.slice(c.start, c.end) })),
    strippedTitle: stripMatches(text, accepted),
    dueDate: dateMatch ? (dateMatch.value as Date) : null,
    startTime: timeMatch ? (timeMatch.value as string) : null,
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
    return { matches: [], strippedTitle: text.trim(), dueDate: null, startTime: null, recurrence: null };
  }
  return parseQuickAdd(text, referenceDate, options);
}
