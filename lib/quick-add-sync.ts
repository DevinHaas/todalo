// Pure last-touch-wins sync between typed quick-add matches and manual field
// edits (DatePicker / TimeRangeInputs / Repeat row) in TaskComposer. See the
// "Field sync (TaskComposer only)" bullet in .scratch/smart-quick-add/spec.md
// and CONTEXT.md's "Matched phrase" glossary entry.

import { format } from "date-fns";
import type { ParseQuickAddResult, QuickAddMatch, QuickAddMatchKind } from "@/lib/parse-quick-add";
import type { Recurrence } from "@/lib/recurrence";

export interface SyncField<T> {
  value: T;
  // Set by a manual field edit; suppresses re-parsing until the anchoring
  // phrase (`appliedMatchText`) changes or disappears from the title.
  overridden: boolean;
  // Set by rejecting a highlighted match; unlike `overridden` this never
  // auto-lifts, matching Todoist's click-to-reject semantics for the session.
  locked: boolean;
  // Text of the match currently backing `value` — null means no phrase is
  // anchoring it (either nothing has matched yet, or a manual value was set
  // with no corresponding title text).
  appliedMatchText: string | null;
}

export interface QuickAddSyncState {
  date: SyncField<Date | undefined>;
  time: SyncField<string>;
  // End time carries no title phrase of its own — it rides the same "time"
  // match as `time` (a range/duration phrase covers both), so it never
  // rewrites the title on a manual edit, unlike date/time/recurrence.
  endTime: SyncField<string>;
  recurrence: SyncField<Recurrence | undefined>;
}

export const initialSyncState: QuickAddSyncState = {
  date: { value: undefined, overridden: false, locked: false, appliedMatchText: null },
  time: { value: "", overridden: false, locked: false, appliedMatchText: null },
  endTime: { value: "", overridden: false, locked: false, appliedMatchText: null },
  recurrence: { value: undefined, overridden: false, locked: false, appliedMatchText: null },
};

export type QuickAddSyncAction =
  | { type: "parse"; parsed: ParseQuickAddResult }
  | { type: "manualDate"; date: Date | undefined; matchText: string | null }
  | { type: "manualTime"; time: string; matchText: string | null }
  | { type: "manualEndTime"; time: string; matchText: string | null }
  | { type: "manualRecurrence"; recurrence: Recurrence | undefined; matchText: string | null }
  | { type: "reject"; kind: QuickAddMatchKind }
  | { type: "reset" }
  // Seeds a baseline value (e.g. TaskComposer's `initialDueDate` prop) that
  // isn't a user override — unlike `manualDate`/`manualTime`, live parsing
  // stays free to take over the moment a phrase matches.
  | { type: "seed"; date: Date | undefined; time: string; endTime?: string };

function findMatch(matches: QuickAddMatch[], kind: QuickAddMatchKind): QuickAddMatch | undefined {
  return matches.find((m) => m.kind === kind);
}

export function quickAddTimeMatchText(matches: QuickAddMatch[]): string | null {
  return matches.filter((match) => match.kind === "time").map((match) => match.text).join(" ") || null;
}

function applyParse<T>(field: SyncField<T>, match: Pick<QuickAddMatch, "text"> | undefined, parsedValue: T): SyncField<T> {
  if (field.locked) return field;
  // An untouched seed or manual value has no phrase for parsing to remove.
  if (!match && field.appliedMatchText === null) return field;
  if (field.overridden) {
    if (match && match.text.toLowerCase() === field.appliedMatchText?.toLowerCase()) return field;
    // The anchoring phrase changed or disappeared — resume live parsing.
  }
  return { value: parsedValue, overridden: false, locked: false, appliedMatchText: match?.text ?? null };
}

export function syncQuickAddFields(state: QuickAddSyncState, action: QuickAddSyncAction): QuickAddSyncState {
  switch (action.type) {
    case "parse": {
      const { matches, dueDate, startTime, endTime, recurrence } = action.parsed;
      const timeMatch = findMatch(matches, "time");
      const endTimeMatchText = quickAddTimeMatchText(matches);
      return {
        date: applyParse(state.date, findMatch(matches, "date"), dueDate ?? undefined),
        time: applyParse(state.time, timeMatch, startTime ?? ""),
        endTime: applyParse(state.endTime, endTimeMatchText ? { text: endTimeMatchText } : undefined, endTime ?? ""),
        recurrence: applyParse(state.recurrence, findMatch(matches, "recurrence"), recurrence ?? undefined),
      };
    }
    case "manualDate":
      return {
        ...state,
        date: { value: action.date, overridden: true, locked: false, appliedMatchText: action.matchText },
      };
    case "manualTime":
      return {
        ...state,
        time: { value: action.time, overridden: true, locked: false, appliedMatchText: action.matchText },
      };
    case "manualEndTime":
      return {
        ...state,
        endTime: { value: action.time, overridden: true, locked: false, appliedMatchText: action.matchText },
      };
    case "manualRecurrence":
      return {
        ...state,
        recurrence: {
          value: action.recurrence,
          overridden: true,
          locked: false,
          appliedMatchText: action.matchText,
        },
      };
    case "reject": {
      // Rejecting clears the matched effect immediately, not just future
      // reparses — a rejected "monthly" shouldn't leave recurrence set.
      if (action.kind === "date") {
        return { ...state, date: { value: undefined, overridden: true, locked: true, appliedMatchText: null } };
      }
      if (action.kind === "time") {
        // A range/duration phrase covers both times, so rejecting it clears
        // and locks both — otherwise endTime would be left orphaned with no
        // start and no way to clear it from the title.
        return {
          ...state,
          time: { value: "", overridden: true, locked: true, appliedMatchText: null },
          endTime: { value: "", overridden: true, locked: true, appliedMatchText: null },
        };
      }
      return {
        ...state,
        recurrence: { value: undefined, overridden: true, locked: true, appliedMatchText: null },
      };
    }
    case "reset":
      return initialSyncState;
    case "seed":
      return {
        ...initialSyncState,
        date: { ...initialSyncState.date, value: action.date },
        time: { ...initialSyncState.time, value: action.time },
        endTime: { ...initialSyncState.endTime, value: action.endTime ?? "" },
      };
  }
}

export function canonicalDateText(date: Date): string {
  return format(date, "d.M");
}

export function canonicalTimeText(time: string): string {
  const [hStr, mStr] = time.split(":");
  const h = parseInt(hStr, 10);
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const meridiem = h < 12 ? "am" : "pm";
  return mStr === "00" ? `at ${hour12}${meridiem}` : `at ${hour12}:${mStr}${meridiem}`;
}

export function canonicalRecurrenceText(recurrence: Recurrence): string {
  return recurrence.n === 1 ? `every ${recurrence.unit}` : `every ${recurrence.n} ${recurrence.unit}s`;
}

// Splices `replacement` into `title` at `match`'s span — used to rewrite a
// matched phrase to its canonical form after a manual field edit.
export function spliceMatch(title: string, match: QuickAddMatch, replacement: string): string {
  return title.slice(0, match.start) + replacement + title.slice(match.end);
}
