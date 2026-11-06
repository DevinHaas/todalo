import { describe, expect, it } from "vitest";
import { planTodoistImport, splitImportedComments, todoistInstant, todoistRecurrence, type ImportSelection, type TodoistSnapshot } from "./todoist-import";

const ZONE = "Europe/Zurich";
const all: ImportSelection["include"] = { sections: true, subtasks: true, labels: true, recurring: true, comments: true, completed: false };

const snapshot = (): TodoistSnapshot => ({
  projects: [
    { id: "inbox", name: "Inbox", inbox_project: true },
    { id: "work", name: "Work", color: "blue" },
    { id: "client", name: "Client", parent_id: "work", color: "nope" },
    { id: "gone", name: "Gone", is_deleted: true },
  ],
  sections: [{ id: "s1", project_id: "work", name: "Doing", section_order: 2 }, { id: "s-inbox", project_id: "inbox", name: "Later" }],
  items: [
    { id: "t1", project_id: "work", section_id: "s1", content: "Top", priority: 4, child_order: 3, labels: ["Urgent", "new"], due: { date: "2026-11-10" } },
    { id: "t2", project_id: "work", parent_id: "t1", content: "Child", priority: 1, due: { date: "2026-11-10T09:30:00" }, duration: { amount: 30, unit: "minute" } },
    { id: "t3", project_id: "work", parent_id: "t2", content: "Grandchild" },
    { id: "t3a", project_id: "work", parent_id: "t3", content: "Level 3" },
    { id: "t3b", project_id: "work", parent_id: "t3a", content: "Level 4" },
    { id: "t4", project_id: "inbox", section_id: "s-inbox", content: "Inbox task", deadline: { date: "2026-12-01" } },
    { id: "t5", project_id: "client", content: "Weekly", due: { date: "2026-11-09", is_recurring: true, string: "every week" } },
    { id: "t6", project_id: "work", content: "Done", checked: true, completed_at: "2026-11-01T10:00:00Z" },
    { id: "t7", project_id: "work", content: "Deleted", is_deleted: true },
    { id: "t8", project_id: "client", content: "Odd", due: { date: "2026-11-09", is_recurring: true, string: "every 3rd friday" } },
  ],
  labels: [{ id: "l-urgent", name: "urgent", color: "red" }, { id: "l-new", name: "new", color: "green" }],
  notes: [{ id: "n1", item_id: "t1", content: "Call Anna", posted_at: "2026-10-22T15:17:00Z" }, { id: "n2", item_id: "t1", file_attachment: { file_name: "a.pdf", file_url: "https://x/a.pdf" } }, { id: "n3", item_id: "t1", content: "old", is_deleted: true }],
});

const context = (mapped: [string, string][] = [], existingLabels = [{ id: "mine", name: "URGENT" }]) => ({ mapped: new Map(mapped), existingLabels, timeZone: ZONE });
const run = (include: Partial<ImportSelection["include"]> = {}, projectIds = ["inbox", "work", "client", "gone"], ctx = context()) =>
  planTodoistImport(snapshot(), { projectIds, include: { ...all, ...include } }, ctx);
const task = (plan: ReturnType<typeof run>, title: string) => plan.tasks.find((t) => t.title === title)!;

describe("planTodoistImport", () => {
  it("flattens project nesting, keeps Inbox as todalo Inbox and skips deleted projects", () => {
    const plan = run();
    expect(plan.projects.map((p) => [p.name, p.color])).toEqual([["Work", "#4073ff"], ["Work / Client", null]]);
    expect(task(plan, "Inbox task").projectId).toBeNull();
  });

  it("imports sections of real projects only and drops Inbox sections", () => {
    const plan = run();
    expect(plan.sections).toEqual([{ id: expect.any(String), projectId: plan.projects[0].id, name: "Doing", sortOrder: 2 }]);
    expect(task(plan, "Top").sectionId).toBe(plan.sections[0].id);
    expect(task(plan, "Inbox task").sectionId).toBeNull();
    expect(run({ sections: false }).sections).toEqual([]);
  });

  it("keeps three sub-task levels and attaches deeper tasks at the deepest level", () => {
    const plan = run();
    const top = task(plan, "Top");
    expect(task(plan, "Child").parentId).toBe(top.id);
    expect(task(plan, "Grandchild").parentId).toBe(task(plan, "Child").id);
    expect(task(plan, "Level 3").parentId).toBe(task(plan, "Grandchild").id);
    expect(task(plan, "Level 4").parentId).toBe(task(plan, "Grandchild").id);
    // Parents come before their sub-tasks in the plan.
    expect(plan.tasks.indexOf(task(plan, "Level 3"))).toBeGreaterThan(plan.tasks.indexOf(task(plan, "Grandchild")));
    expect(plan.warnings[0]).toMatch(/1 nested sub-task was moved up to the deepest level/);
    expect(run({ subtasks: false }).tasks.every((t) => t.parentId === null)).toBe(true);
  });

  it("inverts priority, maps dates, duration and deadline in the user's zone", () => {
    const plan = run();
    expect(task(plan, "Top").priority).toBe(1);
    expect(task(plan, "Child").priority).toBe(4);
    expect(task(plan, "Top").dueDate).toEqual(new Date("2026-11-09T23:00:00Z"));
    expect(task(plan, "Child").dueDate).toEqual(new Date("2026-11-10T08:30:00Z"));
    expect(task(plan, "Child").dueDateEnd).toEqual(new Date("2026-11-10T09:00:00Z"));
    expect(task(plan, "Inbox task").deadline).toEqual(new Date("2026-11-30T23:00:00Z"));
    expect(task(plan, "Top").sortOrder).toBe(3);
  });

  it("converts recurring schedules, falls back to the next date with a warning, or drops them when off", () => {
    const plan = run();
    expect(task(plan, "Weekly").recurrence).toMatchObject({ n: 1, unit: "week", basedOn: "scheduled" });
    expect(task(plan, "Odd").recurrence).toBeNull();
    expect(task(plan, "Odd").dueDate).not.toBeNull();
    expect(plan.warnings.some((w) => /1 recurring schedule could not/.test(w))).toBe(true);
    expect(run({ recurring: false }).tasks.every((t) => t.recurrence === null)).toBe(true);
  });

  it("reuses existing labels by name and creates each missing label once", () => {
    const plan = run();
    expect(plan.labels).toEqual([{ id: expect.any(String), name: "new", color: "#299438" }]);
    const top = task(plan, "Top");
    expect(plan.taskLabels).toEqual([{ taskId: top.id, labelId: "mine" }, { taskId: top.id, labelId: plan.labels[0].id }]);
    expect(run({ labels: false }).taskLabels).toEqual([]);
  });

  it("imports comments and attachment names as comment rows, keeping the description clean", () => {
    const plan = run();
    const top = task(plan, "Top");
    expect(top.description).toBeNull();
    expect(plan.comments.map(({ taskId, body }) => ({ taskId, body }))).toEqual([{ taskId: top.id, body: "Call Anna" }, { taskId: top.id, body: "a.pdf https://x/a.pdf" }]);
    expect(plan.comments[0].createdAt).toEqual(new Date("2026-10-22T15:17:00Z"));
    expect(run({ comments: false }).comments).toEqual([]);
  });

  it("imports completed tasks only when asked, and never deleted ones", () => {
    expect(run().tasks.map((t) => t.title)).not.toContain("Done");
    const done = task(run({ completed: true }), "Done");
    expect(done).toMatchObject({ status: "done", completedAt: new Date("2026-11-01T10:00:00Z") });
    expect(run({ completed: true }).tasks.map((t) => t.title)).not.toContain("Deleted");
  });

  it("imports only selected projects", () => {
    expect(run({}, ["client"]).tasks.map((t) => t.title).sort()).toEqual(["Odd", "Weekly"]);
  });

  it("skips already-imported items and links new sub-tasks to their mapped parent", () => {
    const first = run();
    const second = run({}, undefined, context(first.mappings.map((m) => [`${m.kind}:${m.externalId}`, m.localId])));
    expect(second.tasks).toEqual([]);
    expect(second.projects).toEqual([]);
    expect(second.sections).toEqual([]);
    expect(second.labels).toEqual([]);
    expect(second.skipped).toBe(first.tasks.length);

    const top = first.mappings.find((m) => m.externalId === "t1")!;
    const partial = planTodoistImport(snapshot(), { projectIds: ["work"], include: all }, context([["project:work", "p-local"], ["task:t1", top.localId]]));
    expect(task(partial, "Child")).toMatchObject({ parentId: top.localId, projectId: "p-local" });
  });
});

describe("todoist helpers", () => {
  it("parses date-only, floating and UTC dates", () => {
    expect(todoistInstant("2026-07-01", ZONE)).toEqual({ at: new Date("2026-06-30T22:00:00Z"), timed: false });
    expect(todoistInstant("2026-07-01T12:00:00", ZONE).at).toEqual(new Date("2026-07-01T10:00:00Z"));
    expect(todoistInstant("2026-07-01T12:00:00Z", ZONE).at).toEqual(new Date("2026-07-01T12:00:00Z"));
    expect(() => todoistInstant("tomorrow", ZONE)).toThrow();
  });

  it("treats every! as completion-based", () => {
    expect(todoistRecurrence("every! 2 days")).toMatchObject({ n: 2, unit: "day", basedOn: "completed" });
  });
});

describe("splitImportedComments (one-off backfill)", () => {
  it("moves the appended note block out of the description", () => {
    expect(splitImportedComments("---\nhttps://mail.google.com/a\n\nhttps://mail.google.com/b")).toEqual({ description: null, comments: ["https://mail.google.com/a", "https://mail.google.com/b"] });
    expect(splitImportedComments("Pay rent\n\n---\nCall Anna\na.pdf https://x/a.pdf")).toEqual({ description: "Pay rent", comments: ["Call Anna\na.pdf https://x/a.pdf"] });
  });
  it("leaves descriptions without a note block alone", () => {
    for (const description of [null, "", "Plain", "a --- b", "Line\n---\nnot after a blank line", "x\n\n---\n  "]) expect(splitImportedComments(description)).toBeNull();
  });
});
