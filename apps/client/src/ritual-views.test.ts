import { describe, expect, it } from "vitest";
import { filterCandidates, type CheckInCandidate } from "./ritual-views";

const item = (id: string, title: string, reason: CheckInCandidate["reason"], goal: string | null, labels: string[]): CheckInCandidate =>
  ({ id, title, reason, goal: goal ? { id: goal, title: goal, color: "red" } : null, labels: labels.map(label => ({ id: label, name: label })), slot: "09:00" });
const items = [
  item("a", "Write report", "inbox", "work", ["deep"]),
  item("b", "Buy milk", "today", null, ["errand"]),
  item("c", "Report taxes", "overdue", null, ["errand", "deep"]),
];

describe("filterCandidates", () => {
  it.each([
    ["no search or chips", "", [], ["a", "b", "c"]],
    ["title text, any case", "REPORT", [], ["a", "c"]],
    ["one label", "", ["label:errand"], ["b", "c"]],
    ["labels OR together", "", ["label:errand", "label:deep"], ["a", "b", "c"]],
    ["kinds AND together", "", ["label:deep", "reason:overdue"], ["c"]],
    ["goal chip skips tasks without a goal", "", ["goal:work"], ["a"]],
    ["text and chip", "milk", ["label:deep"], []],
  ])("%s", (_, text, chips, ids) => {
    expect(filterCandidates(items, text, new Set(chips)).map(found => found.id)).toEqual(ids);
  });
});
