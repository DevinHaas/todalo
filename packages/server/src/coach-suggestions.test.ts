import { describe, expect, it } from "vitest";
import { CoachModelError } from "./coach";
import { capacityFacts, capacityVerdict, meaningFacts, mergeSuggestions, parseCapacity, parseMeaning } from "./coach-suggestions";

const refs = new Map([["g1", "fit"], ["g2", "v2"], ["g3", "read"], ["g4", "calm"]]);

describe("parseMeaning", () => {
  it.each([
    ["known refs, best first", '{"goals":["g2","g1"]}', ["v2", "fit"]],
    ["unknown refs dropped", '{"goals":["g9","g1"," g3 "]}', ["fit", "read"]],
    ["duplicates once, at most three", '{"goals":["g1","g1","g2","g3","g4"]}', ["fit", "v2", "read"]],
    ["none fits", '{"goals":[]}', []],
  ])("%s", (_, content, expected) => expect(parseMeaning(content, refs)).toEqual(expected));

  it.each(["not json", '{"goal":"g1"}', '{"goals":[1]}'])("rejects %s", content =>
    expect(() => parseMeaning(content, refs)).toThrow(CoachModelError));
});

describe("mergeSuggestions", () => {
  const scope = { active: ["fit", "v2", "read", "calm"], dismissed: ["calm"] };
  it.each([
    ["rules first, then the Coach's new ones", ["v2"], ["fit", "v2"], { goalIds: ["v2", "fit"], coach: ["fit"] }],
    ["no rules: the Coach's only", [], ["read"], { goalIds: ["read"], coach: ["read"] }],
    ["dismissed and inactive never come back", [], ["calm", "old", "read"], { goalIds: ["read"], coach: ["read"] }],
    ["nothing from the Coach", ["fit"], [], { goalIds: ["fit"], coach: [] }],
  ])("%s", (_, rules, coach, expected) => expect(mergeSuggestions(rules, coach, scope)).toEqual(expected));
});

describe("meaningFacts", () => {
  it("sends only text under short refs", () => {
    const built = meaningFacts({ title: "Eat enough protein", description: null }, [{ id: "fit", title: "Build muscle", description: null }]);
    expect(built?.facts).toEqual({ task: { title: "Eat enough protein", description: "" }, goals: [{ ref: "g1", title: "Build muscle", description: "" }] });
    expect(built?.refs.get("g1")).toBe("fit");
  });
  it.each([["no goals", "Run", []], ["empty title", " ", [{ id: "fit", title: "Fit", description: null }]]])("nothing to ask with %s", (_, title, goals) =>
    expect(meaningFacts({ title, description: null }, goals)).toBeNull());
});

describe("parseCapacity", () => {
  const two = capacityFacts(84, [{ goalId: "fit", title: "Run a marathon", target: "Finish" }, { goalId: "v2", title: "Ship v2", target: "Launch" }])!;
  it("one estimate per goal in order, minutes rounded to 15", () => {
    expect(two.facts.seasonWeeks).toBe(12);
    expect(parseCapacity('{"goals":[{"ref":"g2","hoursPerWeek":6,"reason":"Evenings of build work"},{"ref":"g1","hoursPerWeek":4.1,"reason":"Three runs"}]}', two.refs))
      .toEqual([{ goalId: "fit", minutesPerWeek: 240, reason: "Three runs" }, { goalId: "v2", minutesPerWeek: 360, reason: "Evenings of build work" }]);
  });
  it.each([
    ["a missing goal", '{"goals":[{"ref":"g1","hoursPerWeek":4,"reason":"x"}]}'],
    ["a wild number", '{"goals":[{"ref":"g1","hoursPerWeek":400,"reason":"x"},{"ref":"g2","hoursPerWeek":1,"reason":"y"}]}'],
    ["a negative number", '{"goals":[{"ref":"g1","hoursPerWeek":-1,"reason":"x"},{"ref":"g2","hoursPerWeek":1,"reason":"y"}]}'],
    ["not json", "four hours"],
  ])("rejects %s", (_, content) => expect(() => parseCapacity(content, two.refs)).toThrow(CoachModelError));
  it("nothing to ask without primary goals", () => expect(capacityFacts(84, [])).toBeNull());
});

describe("capacityVerdict", () => {
  const goals = [{ goalId: "fit", minutesPerWeek: 240, reason: "" }, { goalId: "v2", minutesPerWeek: 360, reason: "" }];
  it.each([
    ["fits", goals, 600, { neededMinutes: 600, over: false }],
    ["over by a little", goals, 585, { neededMinutes: 600, over: true }],
    ["time not said", goals, null, { neededMinutes: 600, over: false }],
    ["no estimate", null, 60, { neededMinutes: null, over: false }],
    ["nothing needed", [], 0, { neededMinutes: 0, over: false }],
  ])("%s", (_, estimate, available, expected) => expect(capacityVerdict(estimate, available)).toEqual(expected));
});
