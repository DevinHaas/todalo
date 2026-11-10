import { describe, expect, it } from "vitest";
import { definitionToQuery, evaluateFilter, filterQueryError, parseDateSpec, parseFilterQuery, queryName, runFilterQuery, type FilterTask } from "./filter-query";

// Wednesday 11 November 2026, 10:00 local.
const now = new Date(2026, 10, 11, 10, 0);
const at = (day: number, hours = 0, minutes = 0, month = 10) => new Date(2026, month, day, hours, minutes);
const context = {
  now,
  labels: [{ id: "l-email", name: "email" }, { id: "l-home", name: "Homework" }, { id: "l-office", name: "home office" }, { id: "l-amp", name: "R&D" }],
  projects: [{ id: "p-work", name: "Work" }, { id: "p-art", name: "Artwork" }, { id: "p-shop", name: "Shopping list" }],
  sections: [{ id: "s-meet", name: "Meetings" }, { id: "s-admin", name: "Work Admin" }],
};
const base: FilterTask = { title: "", description: null, status: "todo", priority: 4, projectId: null, sectionId: null, parentId: null, dueDate: null, deadline: null, createdAt: at(1), recurrence: null, labelIds: [] };
const fixtures: Record<string, Partial<FilterTask>> = {
  inbox: { title: "Inbox idea" },
  overdueDay: { title: "Pay rent", dueDate: at(10), priority: 1, projectId: "p-work" },
  overdueTimed: { title: "Standup", dueDate: at(11, 9), projectId: "p-work", sectionId: "s-meet" },
  todayLater: { title: "Write report", dueDate: at(11, 15), labelIds: ["l-email"], description: "send email to Sam" },
  today: { title: "Email Becky", dueDate: at(11), priority: 2, labelIds: ["l-email", "l-home"] },
  tomorrow: { title: "Gym", dueDate: at(12), recurrence: { n: 1, unit: "day" } },
  saturday: { title: "Night out", dueDate: at(14), labelIds: ["l-office"] },
  nextMonday: { title: "Plan week", dueDate: at(16), projectId: "p-art", sectionId: "s-admin" },
  december: { title: "Holidays", dueDate: at(3, 0, 0, 11), projectId: "p-shop" },
  deadlineOnly: { title: "Tax return", deadline: at(13), priority: 3 },
  subtask: { title: "Buy milk", parentId: "x", projectId: "p-shop", labelIds: ["l-amp"] },
  oldTask: { title: "Ancient", createdAt: new Date(2025, 0, 1) },
  done: { title: "Done today", dueDate: at(11), status: "done", labelIds: ["l-email"] },
};
const tasks = Object.entries(fixtures).map(([id, extra]) => ({ ...base, id, ...extra }));
const ids = (query: string) => {
  const parsed = parseFilterQuery(query);
  if (!parsed.ok) throw new Error(parsed.error);
  return evaluateFilter(parsed.groups, tasks, context).map(group => group.tasks.map(task => task.id));
};

describe("filter queries", () => {
  it.each<[string, string[]]>([
    // Dates (due: the date, else the deadline)
    // A timed task earlier today is both today and overdue.
    ["today", ["overdueTimed", "todayLater", "today"]],
    ["tod", ["overdueTimed", "todayLater", "today"]],
    ["tomorrow", ["tomorrow"]],
    ["yesterday", ["overdueDay"]],
    ["overdue", ["overdueDay", "overdueTimed"]],
    ["od | over due", ["overdueDay", "overdueTimed"]],
    ["no date", ["inbox", "deadlineOnly", "subtask", "oldTask"]],
    ["!no date", ["overdueDay", "overdueTimed", "todayLater", "today", "tomorrow", "saturday", "nextMonday", "december"]],
    ["no time", ["overdueDay", "today", "tomorrow", "saturday", "nextMonday", "december"]],
    ["!no date & !no time", ["overdueTimed", "todayLater"]],
    ["no deadline & !no date & recurring", ["tomorrow"]],
    ["3 days", ["overdueTimed", "todayLater", "today", "tomorrow", "deadlineOnly"]],
    ["next 4 days", ["overdueTimed", "todayLater", "today", "tomorrow", "saturday", "deadlineOnly"]],
    ["sat | saturday", ["saturday"]],
    ["Nov 13", ["deadlineOnly"]],
    ["13 Nov", ["deadlineOnly"]],
    ["11/16", ["nextMonday"]],
    ["2026-12-03", ["december"]],
    ["date: today", ["overdueTimed", "todayLater", "today"]],
    ["date: Nov 13", []],
    ["due: Nov 13", ["deadlineOnly"]],
    ["deadline: nov 13", ["deadlineOnly"]],
    ["no deadline & no date", ["inbox", "subtask", "oldTask"]],
    ["date before: today", ["overdueDay"]],
    // An all-day task today counts from midnight.
    ["date before: +4 hours", ["overdueDay", "overdueTimed", "today"]],
    ["date before: today at 2pm", ["overdueDay", "overdueTimed", "today"]],
    ["date: today & date before: today at 2pm", ["overdueTimed", "today"]],
    ["date after: today", ["tomorrow", "saturday", "nextMonday", "december"]],
    ["date after: +4 hours", ["todayLater", "tomorrow", "saturday", "nextMonday", "december"]],
    ["date before: sat", ["overdueDay", "overdueTimed", "todayLater", "today", "tomorrow"]],
    ["date before: next week", ["overdueDay", "overdueTimed", "todayLater", "today", "tomorrow", "saturday"]],
    ["(date: next week | date after: next week) & date before: 1 week after next week", ["nextMonday"]],
    ["date before: first day", ["overdueDay", "overdueTimed", "todayLater", "today", "tomorrow", "saturday", "nextMonday"]],
    ["deadline before: in 7 days", ["deadlineOnly"]],
    ["created before: -365 days", ["oldTask"]],
    ["created after: -365 days & search: buy", ["subtask"]],
    ["created: Nov 1", ["inbox", "overdueDay", "overdueTimed", "todayLater", "today", "tomorrow", "saturday", "nextMonday", "december", "deadlineOnly", "subtask"]],
    // Priority
    ["p1", ["overdueDay"]],
    ["p1 | p2", ["overdueDay", "today"]],
    ["P3", ["deadlineOnly"]],
    ["no priority & #Work", ["overdueTimed"]],
    // Labels: @ and %, case-insensitive, wildcards
    ["@email", ["todayLater", "today"]],
    ["%Email & today", ["todayLater", "today"]],
    ["@home*", ["today", "saturday"]],
    ["@home office", ["saturday"]],
    ["@R\\&D", ["subtask"]],
    ["no labels & no date", ["inbox", "deadlineOnly", "oldTask"]],
    ["@nonexistent", []],
    // Projects and sections
    ["#Work", ["overdueDay", "overdueTimed"]],
    ["##Work", ["overdueDay", "overdueTimed"]],
    ["#*work", ["overdueDay", "overdueTimed", "nextMonday"]],
    ["#Shopping\\ list", ["december", "subtask"]],
    ["#Shopping list & subtask", ["subtask"]],
    ["#Inbox & no date", ["inbox", "deadlineOnly", "oldTask"]],
    ["/Meetings", ["overdueTimed"]],
    ["#Work & /Meetings", ["overdueTimed"]],
    ["/*Admin*", ["nextMonday"]],
    ["/* & !#Work", ["nextMonday"]],
    ["!/* & !#Inbox", ["overdueDay", "december", "subtask"]],
    // Search
    ["search: email", ["todayLater", "today"]],
    ["search: send email", ["todayLater"]],
    ["search: email | search: gym", ["todayLater", "today", "tomorrow"]],
    // Subtasks, all, precedence and grouping
    ["subtask", ["subtask"]],
    ["all", ["inbox", "overdueDay", "overdueTimed", "todayLater", "today", "tomorrow", "saturday", "nextMonday", "december", "deadlineOnly", "subtask", "oldTask"]],
    ["view all & !subtask & p4 & no date", ["inbox", "oldTask"]],
    ["(today | overdue) & @email", ["todayLater", "today"]],
    ["today | overdue & p1", ["overdueDay", "overdueTimed", "todayLater", "today"]],
    ["today & !@email", ["overdueTimed"]],
    ["!(today | overdue) & !no date & !p4", []],
    ["!!today", ["overdueTimed", "todayLater", "today"]],
  ])("%s", (query, expected) => {
    expect(ids(query)).toEqual([expected]);
  });

  it("splits comma-separated lists, titled by their text", () => {
    const parsed = parseFilterQuery("p1 & overdue, today ,  date: yesterday");
    expect(parsed.ok && parsed.groups.map(group => group.source)).toEqual(["p1 & overdue", "today", "date: yesterday"]);
    expect(ids("p1 & overdue, today")).toEqual([["overdueDay"], ["overdueTimed", "todayLater", "today"]]);
  });

  it("never lists completed tasks", () => {
    expect(runFilterQuery("search: done", tasks, context)).toEqual([{ title: "search: done", tasks: [] }]);
  });

  it.each<[string, string]>([
    ["", "Enter a query."],
    ["today &", "The query ends early: add a filter after the last operator."],
    ["(today | overdue", "Close the parenthesis with )."],
    ["today)", "There is a ) without a matching (."],
    ["& today", "Expected a filter before “&”."],
    ["(today, overdue)", "Commas separate lists and can't be inside parentheses."],
    ["today,", "The query ends early: add a filter after the last operator."],
    ["(today) tomorrow", "Join “tomorrow” with & or |."],
    ["banana", "Unknown filter “banana”."],
    ["date before: whenever", "“whenever” isn't a date todalo understands."],
    ["#", "Add a project name after #."],
    ["@", "Add a label name after @."],
    ["search:", "Add a word after search:."],
    ["assigned to: me", "Assignees aren't supported: todalo has no shared projects (“assigned to: me”)."],
    ["!assigned", "Assignees aren't supported: todalo has no shared projects (“assigned”)."],
    ["added by: me", "“added by:” isn't supported: every task is yours (“added by: me”)."],
    ["shared & today", "“shared” isn't supported: todalo has no shared projects (“shared”)."],
    ["workspace: Doist", "Workspaces aren't supported (“workspace: Doist”)."],
    ["uncompletable", "“uncompletable” isn't supported: every todalo task can be completed (“uncompletable”)."],
    ["p5", "Unknown filter “p5”."],
    ["x".repeat(1025), "Queries are at most 1024 characters."],
  ])("rejects %j", (query, error) => {
    expect(filterQueryError(query)).toBe(error);
    expect(runFilterQuery(query, tasks, context)).toEqual([]);
  });

  it.each<[string, ReturnType<typeof parseDateSpec>]>([
    ["Jan 3 2023", { kind: "calendar", month: 0, day: 3, year: 2023 }],
    ["january 3rd", { kind: "calendar", month: 0, day: 3, year: null }],
    ["5/5/27", { kind: "calendar", month: 4, day: 5, year: 2027 }],
    ["thurs", { kind: "weekday", day: 4 }],
    ["today at 12am", { kind: "at", base: { kind: "day", offset: 0 }, minutes: 0 }],
    ["tomorrow at 14:30", { kind: "at", base: { kind: "day", offset: 1 }, minutes: 870 }],
    ["-30 days", { kind: "shift", n: -30, unit: "day", from: "now" }],
    ["13/45", null],
    ["today at 13pm", null],
    ["mo", null],
  ])("reads the date %j", (text, spec) => {
    expect(parseDateSpec(text)).toEqual(spec);
  });

  it("escapes names and turns ticket-14 definitions into queries", () => {
    expect(queryName("R&D (old)")).toBe("R\\&D \\(old\\)");
    const names = { labels: context.labels, projects: context.projects };
    expect(definitionToQuery({ status: "open", due: "any" } as never, names)).toBe("all");
    expect(definitionToQuery({ priority: 1, labelId: "l-amp", projectId: "p-shop", due: "overdue" }, names)).toBe("p1 & @R\\&D & #Shopping list & overdue");
    expect(definitionToQuery({ labelId: "gone", due: "undated" }, names)).toBe("@Deleted label & no date");
    // The converted query matches what the legacy definition matched (open tasks).
    expect(ids(definitionToQuery({ priority: 1, projectId: "p-work", due: "overdue" }, names))).toEqual([["overdueDay"]]);
  });
});
