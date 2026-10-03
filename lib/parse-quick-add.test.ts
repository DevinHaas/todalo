import { describe, expect, it } from "vitest";
import { parseQuickAdd, parseQuickAddOrPlain } from "./parse-quick-add";

// Wednesday 2026-01-14, used as a fixed "now" so date math is deterministic.
const REFERENCE = new Date(2026, 0, 14);

function dateOnly(y: number, m: number, d: number) {
  return new Date(y, m, d);
}

describe("parseQuickAdd", () => {
  it("leaves titles with no match untouched", () => {
    const result = parseQuickAdd("call mom", REFERENCE);
    expect(result.matches).toEqual([]);
    expect(result.strippedTitle).toBe("call mom");
    expect(result.dueDate).toBeNull();
    expect(result.startTime).toBeNull();
    expect(result.recurrence).toBeNull();
  });

  it("recognizes today and its abbreviation", () => {
    for (const word of ["today", "tod"]) {
      const result = parseQuickAdd(`water plants ${word}`, REFERENCE);
      expect(result.dueDate).toEqual(dateOnly(2026, 0, 14));
      expect(result.strippedTitle).toBe("water plants");
    }
  });

  it("recognizes tomorrow and its abbreviation", () => {
    for (const word of ["tomorrow", "tom"]) {
      const result = parseQuickAdd(`call mom ${word}`, REFERENCE);
      expect(result.dueDate).toEqual(dateOnly(2026, 0, 15));
      expect(result.strippedTitle).toBe("call mom");
    }
  });

  it("recognizes weekday names and 3-letter abbreviations", () => {
    // Reference is Wednesday; "friday"/"fri" should land 2 days out.
    for (const word of ["friday", "fri"]) {
      const result = parseQuickAdd(`gym ${word}`, REFERENCE);
      expect(result.dueDate).toEqual(dateOnly(2026, 0, 16));
    }
    // A weekday equal to today resolves to today, not 7 days out.
    const sameDay = parseQuickAdd("standup wednesday", REFERENCE);
    expect(sameDay.dueDate).toEqual(dateOnly(2026, 0, 14));
    // A weekday earlier in the week than today rolls into next week.
    const earlier = parseQuickAdd("standup monday", REFERENCE);
    expect(earlier.dueDate).toEqual(dateOnly(2026, 0, 19));
  });

  it("recognizes next week as the following Monday", () => {
    const result = parseQuickAdd("plan trip next week", REFERENCE);
    expect(result.dueDate).toEqual(dateOnly(2026, 0, 19));
    expect(result.strippedTitle).toBe("plan trip");
  });

  it("recognizes explicit month-day dates", () => {
    const result = parseQuickAdd("taxes jan 27", REFERENCE);
    expect(result.dueDate).toEqual(dateOnly(2026, 0, 27));
    expect(result.strippedTitle).toBe("taxes");
  });

  it("rolls an explicit date into next year once it has passed", () => {
    const result = parseQuickAdd("taxes jan 1", REFERENCE);
    expect(result.dueDate).toEqual(dateOnly(2027, 0, 1));
  });

  it("recognizes numeric dd/mm and dd.mm dates", () => {
    const slash = parseQuickAdd("passport renewal 27/1", REFERENCE);
    expect(slash.dueDate).toEqual(dateOnly(2026, 0, 27));

    const dot = parseQuickAdd("standup 21.12", REFERENCE);
    expect(dot.dueDate).toEqual(dateOnly(2026, 11, 21));
  });

  it("recognizes time-of-day and converts to 24-hour HH:mm", () => {
    const result = parseQuickAdd("call mom at 4pm", REFERENCE);
    expect(result.startTime).toBe("16:00");
    expect(result.strippedTitle).toBe("call mom");

    const withMinutes = parseQuickAdd("call mom at 4:30pm", REFERENCE);
    expect(withMinutes.startTime).toBe("16:30");

    const am = parseQuickAdd("call mom at 9am", REFERENCE);
    expect(am.startTime).toBe("09:00");

    const noonHour = parseQuickAdd("call mom at 12pm", REFERENCE);
    expect(noonHour.startTime).toBe("12:00");
  });

  it("recognizes bare 24-hour clock times", () => {
    const result = parseQuickAdd("standup 19:30", REFERENCE);
    expect(result.startTime).toBe("19:30");
    expect(result.endTime).toBeNull();
    expect(result.strippedTitle).toBe("standup");
  });

  it.each([
    ["4pm", "16:00"],
    ["4am", "04:00"],
    ["4:30pm", "16:30"],
    ["12am", "00:00"],
    ["12pm", "12:00"],
    ["9 AM", "09:00"],
    ["7:15Pm", "19:15"],
    ["16:00", "16:00"],
    ["00:00", "00:00"],
    ["at 4", "04:00"],
    ["at 16", "16:00"],
  ])("recognizes the individual time %j without an end or duration", (phrase, time) => {
    for (const text of [`${phrase} I want to do this`, `I want to do this ${phrase}`]) {
      const result = parseQuickAdd(text, REFERENCE);
      expect(result.startTime).toBe(time);
      expect(result.endTime).toBeNull();
      expect(result.strippedTitle).toBe("I want to do this");
      expect(result.matches).toEqual([
        { start: text.indexOf(phrase), end: text.indexOf(phrase) + phrase.length, kind: "time", text: phrase },
      ]);
    }
  });

  it.each(["0pm", "13am", "4:60pm", "4:300pm", "14pm", "123pm", "a4pm", "4pmx", "at 24", "at 123", "at 4:99", "at 4.30", "at 4/30"])(
    "does not recognize an invalid or partial individual time %j",
    (phrase) => {
      const text = `meeting ${phrase}`;
      const result = parseQuickAdd(text, REFERENCE);
      expect(result.matches).toEqual([]);
      expect(result.startTime).toBeNull();
      expect(result.strippedTitle).toBe(text);
    },
  );

  it("lets a standalone am/pm time be rejected while retaining its title text", () => {
    const result = parseQuickAdd("4pm call mom tomorrow", REFERENCE, {
      isRejected: (match) => match.text === "4pm",
    });
    expect(result.startTime).toBeNull();
    expect(result.endTime).toBeNull();
    expect(result.strippedTitle).toBe("4pm call mom");
    expect(result.matches.map((match) => match.text)).toEqual(["tomorrow"]);
  });

  it("combines a standalone am/pm time with a detached duration", () => {
    const result = parseQuickAdd("call mom 4pm tomorrow for 30min", REFERENCE);
    expect(result.startTime).toBe("16:00");
    expect(result.endTime).toBe("16:30");
    expect(result.strippedTitle).toBe("call mom");
  });

  it.each(["buy 4 apples", "review ticket 16", "prepare 12 slides"])(
    "keeps ordinary numbers as title text in %j",
    (text) => {
      const result = parseQuickAdd(text, REFERENCE);
      expect(result.matches).toEqual([]);
      expect(result.startTime).toBeNull();
      expect(result.strippedTitle).toBe(text);
    },
  );

  it("recognizes a time range with '-' and 'until'", () => {
    const dash = parseQuickAdd("meeting tod 19:30 - 20:00", REFERENCE);
    expect(dash.startTime).toBe("19:30");
    expect(dash.endTime).toBe("20:00");

    const until = parseQuickAdd("meeting tod 19:30 until 20:00", REFERENCE);
    expect(until.startTime).toBe("19:30");
    expect(until.endTime).toBe("20:00");

    const followedByDate = parseQuickAdd("meeting 19:30 - 20:00 tomorrow", REFERENCE);
    expect(followedByDate.matches[0].text).toBe("19:30 - 20:00");
  });

  it.each([
    ["4pm to 5pm", "16:00", "17:00"],
    ["from 4pm to 5pm", "16:00", "17:00"],
    ["4am to 6pm", "04:00", "18:00"],
    ["from 16:00 to 17:00", "16:00", "17:00"],
    ["FROM 4 PM TO 5 PM", "16:00", "17:00"],
    ["from 4:15pm to 5pm", "16:15", "17:00"],
    ["at 4pm until 5:30pm", "16:00", "17:30"],
    ["4pm-5pm", "16:00", "17:00"],
    ["from 19:30 - 20:00", "19:30", "20:00"],
    ["from 19:30 until 20:00", "19:30", "20:00"],
    ["19:30 - 20", "19:30", "20:00"],
    ["12am to 12pm", "00:00", "12:00"],
  ])("recognizes and strips the complete time range %j", (phrase, start, end) => {
    for (const text of [`I want to do ${phrase}`, `${phrase} I want to do this`]) {
      const result = parseQuickAdd(text, REFERENCE);
      expect(result.startTime).toBe(start);
      expect(result.endTime).toBe(end);
      expect(result.strippedTitle).toBe(text.startsWith(phrase) ? "I want to do this" : "I want to do");
      expect(result.matches).toEqual([
        { start: text.indexOf(phrase), end: text.indexOf(phrase) + phrase.length, kind: "time", text: phrase },
      ]);
    }
  });

  it("lets the complete from/to annotation be rejected without consuming its endpoints", () => {
    const text = "meeting tomorrow from 4pm to 5pm";
    const result = parseQuickAdd(text, REFERENCE, {
      isRejected: (match) => match.text === "from 4pm to 5pm",
    });
    expect(result.startTime).toBeNull();
    expect(result.endTime).toBeNull();
    expect(result.matches.map((match) => match.text)).toEqual(["tomorrow"]);
    expect(result.strippedTitle).toBe("meeting from 4pm to 5pm");
  });

  it.each([
    "from 0pm to 5pm",
    "from 13pm to 5pm",
    "from 4pm to 13pm",
    "from 4:60pm to 5pm",
    "from 4pm to 5:60pm",
    "from 24:00 to 17:00",
    "from 16:00 to 24:00",
    "from 16:99 to 17:00",
    "from 16:00 to 17:99",
  ])("leaves the invalid range %j intact instead of using a partial time", (phrase) => {
    const text = `meeting ${phrase}`;
    const result = parseQuickAdd(text, REFERENCE);
    expect(result.matches).toEqual([]);
    expect(result.startTime).toBeNull();
    expect(result.endTime).toBeNull();
    expect(result.strippedTitle).toBe(text);
  });

  it.each(["4 to 5", "a4pm to 5pmx", "at 13:00pm", "123:45", "16:000"])(
    "does not recognize an ambiguous or partial clock token %j",
    (phrase) => {
      const result = parseQuickAdd(`meeting ${phrase}`, REFERENCE);
      expect(result.matches).toEqual([]);
      expect(result.strippedTitle).toBe(`meeting ${phrase}`);
    },
  );

  it("recognizes a duration ('for Nmin'/'for Nh') and derives the end time", () => {
    const minutes = parseQuickAdd("meeting tod 19:30 for 30min", REFERENCE);
    expect(minutes.startTime).toBe("19:30");
    expect(minutes.endTime).toBe("20:00");

    const hours = parseQuickAdd("meeting tod 19:30 for 1h", REFERENCE);
    expect(hours.endTime).toBe("20:30");

    // Wraps past midnight rather than producing an invalid hour.
    const wraps = parseQuickAdd("meeting tod 23:30 for 1h", REFERENCE);
    expect(wraps.endTime).toBe("00:30");
  });

  it("recognizes a duration detached from its time by other words", () => {
    const result = parseQuickAdd("meeting 19:00 today for 1h", REFERENCE);
    expect(result.startTime).toBe("19:00");
    expect(result.endTime).toBe("20:00");
    expect(result.matches.map((m) => m.text)).toEqual(["19:00", "today", "for 1h"]);
    expect(result.strippedTitle).toBe("meeting");
  });

  it("does not fabricate an end time from a lone 'for' duration with no time", () => {
    const result = parseQuickAdd("wait for 1h", REFERENCE);
    expect(result.startTime).toBeNull();
    expect(result.endTime).toBeNull();
    expect(result.matches).toEqual([]);
  });

  it("leaves a detached duration as text when its start time is rejected", () => {
    const result = parseQuickAdd("meeting 19:00 today for 1h", REFERENCE, {
      isRejected: (match) => match.text === "19:00",
    });
    expect(result.startTime).toBeNull();
    expect(result.endTime).toBeNull();
    expect(result.matches.map((match) => match.text)).toEqual(["today"]);
    expect(result.strippedTitle).toBe("meeting 19:00 for 1h");
  });

  it("anchors a detached duration to the earliest accepted start time", () => {
    const text = "meeting 19:00 today at 8pm for 1h";
    const result = parseQuickAdd(text, REFERENCE);
    expect(result.startTime).toBe("19:00");
    expect(result.endTime).toBe("20:00");

    const rejected = parseQuickAdd(text, REFERENCE, {
      isRejected: (match) => match.text === "19:00",
    });
    expect(rejected.startTime).toBe("20:00");
    expect(rejected.endTime).toBe("21:00");
  });

  it("combines a date match and a time match from the same title", () => {
    const result = parseQuickAdd("call mom tomorrow at 4pm", REFERENCE);
    expect(result.dueDate).toEqual(dateOnly(2026, 0, 15));
    expect(result.startTime).toBe("16:00");
    expect(result.strippedTitle).toBe("call mom");
  });

  it.each([
    ["every day", { n: 1, unit: "day" }],
    ["daily", { n: 1, unit: "day" }],
    ["every week", { n: 1, unit: "week" }],
    ["weekly", { n: 1, unit: "week" }],
    ["every month", { n: 1, unit: "month" }],
    ["monthly", { n: 1, unit: "month" }],
    ["every 3 days", { n: 3, unit: "day" }],
    ["every 2 weeks", { n: 2, unit: "week" }],
    ["every 1 month", { n: 1, unit: "month" }],
    ["every 4 years", { n: 4, unit: "year" }],
  ] as const)("recognizes recurrence phrase %j", (phrase, expected) => {
    const result = parseQuickAdd(`water plants ${phrase}`, REFERENCE);
    expect(result.recurrence).toEqual({
      n: expected.n,
      unit: expected.unit,
      basedOn: "scheduled",
      until: null,
    });
    expect(result.strippedTitle).toBe("water plants");
  });

  it("rejects partial-word matches (whole-word boundaries only)", () => {
    const result = parseQuickAdd("Monica's birthday", REFERENCE);
    expect(result.matches).toEqual([]);
    expect(result.dueDate).toBeNull();
    expect(result.strippedTitle).toBe("Monica's birthday");
  });

  it("still highlights ambiguous whole-word matches, relying on click-to-reject", () => {
    const result = parseQuickAdd("Create monthly report", REFERENCE);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].text).toBe("monthly");
    expect(result.recurrence).toEqual({ n: 1, unit: "month", basedOn: "scheduled", until: null });
  });

  it("prefers the longest match on overlapping candidates", () => {
    const result = parseQuickAdd("plan trip next week", REFERENCE);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].text).toBe("next week");
  });

  it("matches case-insensitively", () => {
    const result = parseQuickAdd("Call mom TOMORROW", REFERENCE);
    expect(result.dueDate).toEqual(dateOnly(2026, 0, 15));
  });

  it("returns match offsets that point back into the original text", () => {
    const text = "call mom tomorrow";
    const result = parseQuickAdd(text, REFERENCE);
    const [match] = result.matches;
    expect(text.slice(match.start, match.end)).toBe(match.text);
    expect(match.kind).toBe("date");
  });
});

describe("parseQuickAddOrPlain", () => {
  it("parses normally when enabled", () => {
    const result = parseQuickAddOrPlain("call mom tomorrow", true, REFERENCE);
    expect(result.dueDate).toEqual(dateOnly(2026, 0, 15));
    expect(result.strippedTitle).toBe("call mom");
  });

  it("leaves the title untouched with no matches when disabled", () => {
    const result = parseQuickAddOrPlain("call mom tomorrow", false, REFERENCE);
    expect(result.matches).toEqual([]);
    expect(result.strippedTitle).toBe("call mom tomorrow");
    expect(result.dueDate).toBeNull();
    expect(result.startTime).toBeNull();
    expect(result.recurrence).toBeNull();
  });
});
