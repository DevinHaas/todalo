import { describe, expect, test } from "vitest";
import { CoachModelError } from "./coach";
import { parseSeasonSetup, seasonSetupInput, seasonSetupMessages } from "./coach-season-setup";

const goal = (patch: Record<string, unknown> = {}) => ({
  title: "Run a half marathon", tier: "primary", target: "21 km under 2 hours", color: "green", icon: "footprints",
  question: "How much are you running at the moment?", ...patch,
});
const parse = (goals: unknown[]) => parseSeasonSetup(JSON.stringify({ goals }));

describe("parseSeasonSetup", () => {
  test("keeps clean suggestions as they are", () => {
    expect(parse([goal()])).toEqual([{ title: "Run a half marathon", tier: "primary", target: "21 km under 2 hours", color: "green", icon: "footprints", question: "How much are you running at the moment?" }]);
  });

  test("caps primaries at three, gives each goal its own known colour and a known icon, and at most four goals", () => {
    const goals = parse([goal(), goal({ color: "green" }), goal({ color: "nope" }), goal({ icon: "unicorn" }), goal()]);
    expect(goals).toHaveLength(4);
    expect(goals.map(item => item.tier)).toEqual(["primary", "primary", "primary", "secondary"]);
    expect(new Set(goals.map(item => item.color)).size).toBe(4);
    expect(goals[3]!.icon).toBe("target");
  });

  test("refuses bad JSON, a bad shape and an empty list", () => {
    expect(() => parseSeasonSetup("{")).toThrow(CoachModelError);
    expect(() => parseSeasonSetup(JSON.stringify({ goals: [{ title: 1 }] }))).toThrow(CoachModelError);
    expect(() => parse([goal({ title: " ", target: "" })])).toThrow(CoachModelError);
  });
});

test("the messages say how long the season runs and pass the user's words as user text", () => {
  const input = seasonSetupInput.parse({ intention: " Get fit ", lengthDays: 84 });
  const messages = seasonSetupMessages(input);
  expect(messages[1]!.content).toContain("84 days (about 12 weeks)");
  expect(messages[2]).toEqual({ role: "user", content: "Get fit" });
});
