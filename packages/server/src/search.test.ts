import { describe, expect, it } from "vitest";
import { FIND_LIMIT, findItems, matchFindItems, searchQuery, searchTasks } from "./search";

describe("legacy search semantics", () => {
  const tasks = [
    { id: "a", title: "Write Report", description: null },
    { id: "b", title: "Call", description: "about the REPORT draft" },
    { id: "c", title: "Groceries", description: "" },
  ];
  it("matches title and description case-insensitively in the given order; empty matches all", () => {
    expect(searchTasks(tasks, "report").map(task => task.id)).toEqual(["a", "b"]);
    expect(searchTasks(tasks, "").map(task => task.id)).toEqual(["a", "b", "c"]);
    // The legacy page joined title and description with one space.
    expect(searchTasks(tasks, "call about").map(task => task.id)).toEqual(["b"]);
    expect(searchTasks(tasks, "null")).toEqual([]);
  });
  it("cuts the query at 200 characters and ignores non-strings", () => {
    expect(searchQuery("x".repeat(250))).toHaveLength(200);
    expect(searchQuery(undefined)).toBe("");
    expect(searchQuery(["a", "b"])).toBe("");
  });
  it("lists Quick Find items as the legacy layout did and matches titles only", () => {
    const items = findItems([{ id: "t/1", title: "Plan trip" }], [{ id: "p1", name: "Travel plans" }], [{ id: "s1", projectId: "p1", name: "Planning" }]);
    expect(items).toEqual([
      { id: "t/1", title: "Plan trip", href: "/tasks/t%2F1", kind: "Task" },
      { id: "p1", title: "Travel plans", href: "/projects/p1", kind: "Project" },
      { id: "s1", title: "Planning", href: "/projects/p1#section-s1", kind: "Section" },
    ]);
    expect(matchFindItems(items, "PLAN").map(item => item.kind)).toEqual(["Task", "Project", "Section"]);
    expect(matchFindItems(items, "plan", true).map(item => item.id)).toEqual(["s1"]);
    const many = findItems(Array.from({ length: 50 }, (_, index) => ({ id: `t${index}`, title: "Same" })), [], []);
    expect(matchFindItems(many, "same")).toHaveLength(FIND_LIMIT);
  });
});
