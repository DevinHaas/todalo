import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { filterPlan, hoursLabel, planChips, PlanSidebar, type PlanRowData, type PlanSlots } from "./plan-views";

// Ticket 14c: the Plan keeps 14b's Check-in search and chips (goals, labels) above 10 rows.
const item = (id: string, title: string, goal: string | null, labels: string[]) =>
  ({ id, title, goal: goal ? { id: goal, title: goal, color: "red", icon: "target" } : null, labels: labels.map(label => ({ id: label, name: label })) }) satisfies Pick<PlanRowData, "id" | "title" | "goal" | "labels">;
const items = [
  item("a", "Write report", "work", ["deep"]),
  item("b", "Buy milk", null, ["errand"]),
  item("c", "Report taxes", null, ["errand", "deep"]),
];

describe("filterPlan", () => {
  it.each([
    ["no search or chips", "", [], ["a", "b", "c"]],
    ["title text, any case", "REPORT", [], ["a", "c"]],
    ["one label", "", ["label:errand"], ["b", "c"]],
    ["labels OR together", "", ["label:errand", "label:deep"], ["a", "b", "c"]],
    ["kinds AND together", "", ["label:deep", "goal:work"], ["a"]],
    ["goal chip skips tasks without a goal", "", ["goal:work"], ["a"]],
    ["text and chip", "milk", ["label:deep"], []],
  ])("%s", (_, text, chips, ids) => {
    expect(filterPlan(items, text, new Set(chips)).map(found => found.id)).toEqual(ids);
  });

  it("offers only the goals and labels some row has, goals first", () => {
    expect(planChips(items)).toEqual([["goal:work", "work"], ["label:deep", "@deep"], ["label:errand", "@errand"]]);
  });
});

describe("Now, Next, Inbox and Later (ticket 31)", () => {
  const row = (id: string): PlanRowData => ({ id, title: id, date: "", tone: null, subtasks: { done: 0, total: 0 }, comments: 0, project: null, goal: null, labels: [], slot: "10:00" });
  const slots = new Proxy({}, { get: () => () => {} }) as PlanSlots;
  const render = (nowLoad: { minutes: number; free: number }) => renderToStaticMarkup(createElement(PlanSidebar, {
    groups: { overdue: [], today: [], week: [], now: [row("Ship it")], next: [row("Tidy desk")], inbox: [row("Call mum")], later: [row("Learn Rust")] },
    projects: [], projectId: undefined, onProject: () => {}, slots, nowLoad,
  }));

  it("opens Now and Next, collapses the Inbox and Later, each with its count", () => {
    const html = render({ minutes: 30, free: 600 });
    expect(html).toContain("Ship it");
    expect(html).toContain("Tidy desk");
    expect(html).not.toContain("Call mum");
    expect(html).not.toContain("Learn Rust");
    expect(html.indexOf('data-plan-group="now"')).toBeLessThan(html.indexOf('data-plan-group="next"'));
    expect(html.indexOf('data-plan-group="inbox"')).toBeLessThan(html.indexOf('data-plan-group="later"'));
    expect(html).not.toContain("data-plan-now-warning");
  });

  it("warns when Now needs more time than the week has free", () => {
    expect(render({ minutes: 14 * 60, free: 9 * 60 })).toContain("Now has 14 h; about 9 h are free this week.");
    expect(hoursLabel(45)).toBe("45 min");
  });
});
