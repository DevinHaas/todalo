// Smart quick add for the shared composer (ticket 12). Parsing, highlighting
// and last-touch-wins field sync are the legacy modules in @todalo/ramble
// (apps/web uses the same ones); this file only adapts their Date values to the
// client's ISO DTOs and native date/time inputs.
import { parseQuickAddOrPlain, type ParseQuickAddResult } from "@todalo/ramble/quick-add";
import { syncQuickAddFields, type QuickAddSyncState } from "@todalo/ramble/quick-add-sync";
import type { Recurrence } from "@todalo/ramble/recurrence";
import { dateInputValue, localInstant, type NewTask, type Placement, type RecurrenceDto } from "./tasks";

/** Rejected phrases are kept lower-cased for the whole draft (legacy click-to-reject). */
export function parseTitle(title: string, enabled: boolean, rejected: ReadonlySet<string>, now?: Date, baseTime?: { start: string; end: string | null }): ParseQuickAddResult {
  return parseQuickAddOrPlain(title, enabled, now, { isRejected: (match) => rejected.has(match.text.toLowerCase()), baseTime });
}

const startOfDay = (now: Date) => { const day = new Date(now); day.setHours(0, 0, 0, 0); return day; };

/** The schedule shown in the composer: a time with no date means today (legacy). */
export function scheduleOf(state: QuickAddSyncState, now = new Date()) {
  return {
    date: state.date.value ?? (state.time.value ? startOfDay(now) : undefined),
    start: state.time.value, end: state.endTime.value, recurrence: state.recurrence.value,
  };
}

/**
 * The fields to create, exactly as the legacy TaskComposer submitted them: the
 * latest title is flushed through the sync rules first (so a manual choice for
 * an unchanged phrase is kept), the matched phrases are stripped from the
 * title, and the time is combined with the date in the viewer's zone.
 */
export function quickAddTask(title: string, state: QuickAddSyncState, parsed: ParseQuickAddResult, now = new Date()) {
  const { date, start, end, recurrence } = scheduleOf(syncQuickAddFields(state, { type: "parse", parsed }), now);
  const day = date && dateInputValue(date.toISOString());
  return {
    title: parsed.strippedTitle || title.trim(),
    dueDate: day ? localInstant(day, start) : null,
    dueDateEnd: day && start && end ? localInstant(day, end) : null,
    recurrence: recurrence ? toRecurrenceDto(recurrence) : null,
  };
}

/** The legacy composer's Additional actions as the draft holds them (deadline is a date input value). */
export interface ComposerMetadata { priority: number; deadline: string; labelIds: string[] }
/** Where a composer was opened: its project view section and, for inserts, the position. */
export interface ComposerOrigin { projectId: string | null; sectionId: string | null; placement?: Placement }

/**
 * The create fields beyond the schedule. Defaults are omitted (as the legacy
 * composer's createTask did), and the section and position only apply in the
 * project the composer was opened in — the picker moving the task elsewhere drops them.
 */
export function composerFields(metadata: ComposerMetadata, projectId: string | null, origin: ComposerOrigin): Partial<NewTask> {
  const home = projectId === origin.projectId;
  return {
    ...(projectId && { projectId }),
    ...(home && origin.sectionId && { sectionId: origin.sectionId }),
    ...(metadata.priority !== 4 && { priority: metadata.priority }),
    ...(metadata.deadline && { deadline: localInstant(metadata.deadline) }),
    ...(metadata.labelIds.length > 0 && { labelIds: metadata.labelIds }),
    ...(home && origin.placement && { placement: origin.placement }),
  };
}

export const toRecurrenceDto = ({ n, unit, basedOn, until }: Recurrence): RecurrenceDto =>
  ({ n, unit, basedOn, until: until ? until.toISOString() : null });
export const fromRecurrenceDto = ({ n, unit, basedOn, until }: RecurrenceDto): Recurrence =>
  ({ n, unit, basedOn, until: until ? new Date(until) : null });

/** `<input type="date">` value ↔ local-midnight Date. */
export const dateValue = (date: Date | undefined) => date ? dateInputValue(date.toISOString()) : "";
export const fromDateValue = (value: string) => value ? new Date(localInstant(value)) : undefined;

const month = new Intl.DateTimeFormat("en-US", { month: "short" });
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
/** Legacy composer date pill: "No Date", "Today", "Tomorrow" or "16 Oct". */
export function dueDateLabel(date: Date | undefined, now = new Date()) {
  if (!date) return "No Date";
  const today = startOfDay(now);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  if (sameDay(date, today)) return "Today";
  if (sameDay(date, tomorrow)) return "Tomorrow";
  return `${date.getDate()} ${month.format(date)}`;
}

const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short" });
const addDays = (date: Date, days: number) => { const next = new Date(date); next.setDate(date.getDate() + days); return next; };
// ponytail: same simple heuristics as the legacy picker (quickDateOptions), not a date engine.
export function quickDateOptions(now = new Date()) {
  const today = startOfDay(now);
  const saturday = addDays(today, ((6 - today.getDay() + 7) % 7) || 7);
  const monday = addDays(today, 7 - ((today.getDay() + 6) % 7));
  return [
    { label: "Tomorrow", day: weekday.format(addDays(today, 1)), date: addDays(today, 1) },
    { label: "Later this week", day: weekday.format(addDays(today, 2)), date: addDays(today, 2) },
    { label: "This weekend", day: weekday.format(saturday), date: saturday },
    { label: "Next week", day: `${monday.getDate()} ${month.format(monday)}`, date: monday },
  ];
}

/** The date popovers' list: Today first, then the legacy quick dates. */
export function quickDates(now = new Date()) {
  const today = startOfDay(now);
  return [{ label: "Today", day: weekday.format(today), date: today }, ...quickDateOptions(now)];
}

const ordinal = (n: number) => {
  const suffixes = ["th", "st", "nd", "rd"]; const v = n % 100;
  return `${n}${suffixes[(v - 20) % 10] ?? suffixes[v] ?? suffixes[0]}`;
};
/** Legacy picker presets, anchored to the picked date (or today). */
export function repeatPresetsFor(anchor: Date): { label: string; recurrence: Recurrence }[] {
  return [
    { label: "Every day", recurrence: { n: 1, unit: "day", basedOn: "scheduled" } },
    { label: `Every week on ${new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(anchor)}`, recurrence: { n: 1, unit: "week", basedOn: "scheduled" } },
    { label: `Every month on the ${ordinal(anchor.getDate())}`, recurrence: { n: 1, unit: "month", basedOn: "scheduled" } },
  ];
}

/** The `@label` being typed at the caret: `@` at the start or after a space, then no spaces. */
export function labelMention(title: string, caret: number): { start: number; query: string } | null {
  const match = /(?:^|\s)@([^\s@]*)$/.exec(title.slice(0, caret));
  return match ? { start: caret - match[1]!.length - 1, query: match[1]! } : null;
}

/** The title once a picked mention is removed: the text either side, without a doubled space. */
export function withoutMention(title: string, mention: { start: number }, caret: number) {
  const before = title.slice(0, mention.start);
  return { title: before + title.slice(caret).replace(/^\s+/, ""), caret: before.length };
}

/** How close (px) a dragged box's center must come to the viewport's center line to snap onto it. */
export const SNAP_PX = 8;
/** Snaps a dragged box's center onto the viewport's center lines (Raycast-style) and says which guides to draw. */
export function snapToCenter(center: { x: number; y: number }, viewport: { width: number; height: number }) {
  const x = Math.min(Math.max(center.x, 0), viewport.width), y = Math.min(Math.max(center.y, 0), viewport.height);
  const vertical = Math.abs(x - viewport.width / 2) <= SNAP_PX, horizontal = Math.abs(y - viewport.height / 2) <= SNAP_PX;
  return { x: vertical ? viewport.width / 2 : x, y: horizontal ? viewport.height / 2 : y, vertical, horizontal };
}
