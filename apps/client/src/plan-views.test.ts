import { describe, expect, it } from "vitest";
import { filterPlan, planChips, type PlanRowData } from "./plan-views";

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
