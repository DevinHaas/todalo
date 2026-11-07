import { describe, expect, it } from "vitest";
import { AccountTransportError } from "./errors";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { confirmingCriteria, criteriaProgress, goalKeys, goalMutations, goalQueries, linkedGoalIds, moveCriterion, setCriteriaPrompt, toggleLink, type GoalLinksDto, type GoalTransport, type MilestoneDto } from "./goals";

const links: GoalLinksDto = { projects: [{ goalId: "fit", projectId: "run" }], tasks: [{ goalId: "fit", taskId: "protein", milestone: false }] };

describe("optimistic goal links", () => {
  it.each([
    ["links a task to a second goal", toggleLink(links, "muscle", "tasks", "protein", true), "tasks", "protein", ["fit", "muscle"]],
    ["linking twice keeps one link", toggleLink(links, "fit", "tasks", "protein", true), "tasks", "protein", ["fit"]],
    ["unlinks only that pair", toggleLink(links, "fit", "tasks", "protein", false), "tasks", "protein", []],
    ["links a project to a second goal", toggleLink(links, "muscle", "projects", "run", true), "projects", "run", ["fit", "muscle"]],
    ["unlinking a project leaves task links", toggleLink(links, "fit", "projects", "run", false), "tasks", "protein", ["fit"]],
  ] as const)("%s", (_name, next, kind, target, expected) => {
    expect(linkedGoalIds(next, kind, target)).toEqual(expected);
  });
});

describe("milestone completion confirm (ticket 06)", () => {
  const refusing = (calls: boolean[]) => async (confirm: boolean) => {
    calls.push(confirm);
    if (!confirm) throw new AccountTransportError("CRITERIA_OPEN");
    return "done";
  };

  it("asks once and repeats the completion with the confirm", async () => {
    let asked = 0;
    setCriteriaPrompt(async () => { asked++; return true; });
    const calls: boolean[] = [];
    expect(await confirmingCriteria(refusing(calls))).toBe("done");
    expect([asked, calls]).toEqual([1, [false, true]]);
  });

  it("Cancel keeps the refusal, so the check-off rolls back; other errors never ask", async () => {
    let asked = 0;
    setCriteriaPrompt(async () => { asked++; return false; });
    const calls: boolean[] = [];
    await expect(confirmingCriteria(refusing(calls))).rejects.toMatchObject({ code: "CRITERIA_OPEN" });
    await expect(confirmingCriteria(async () => { throw new AccountTransportError("TASK_CHANGED"); })).rejects.toMatchObject({ code: "TASK_CHANGED" });
    expect([asked, calls]).toEqual([1, [false]]);
  });

  it.each([
    [["a", "b", "c"], 1, -1, ["b", "a", "c"]],
    [["a", "b", "c"], 2, 1, ["a", "b", "c"]],
    [["a", "b", "c"], 0, -1, ["a", "b", "c"]],
  ] as const)("moves %j[%i] by %i", (items, index, by, expected) => {
    expect(moveCriterion(items, index, by)).toEqual(expected);
  });

  it("shows progress as ticked/total", () => {
    expect(criteriaProgress([{ text: "a", done: true }, { text: "b", done: false }, { text: "c", done: true }])).toBe("2/3");
  });
});

describe("milestone saves", () => {
  // The user's report: turning Milestone on and quickly adding criteria lost the first
  // one, because the switch's refetch landed after it and the next add built on that.
  it("run in order and refresh only after the last, so a quick edit is never dropped", async () => {
    let server: MilestoneDto | null = null;
    const saved: (MilestoneDto | null)[] = [];
    const transport = {
      milestone: async () => server,
      setMilestone: async (_taskId: string, next: MilestoneDto | null) => { await new Promise(resolve => setTimeout(resolve, 5)); saved.push(next); server = next; return true; },
    } as unknown as GoalTransport;
    const cache = new QueryClient();
    await cache.fetchQuery(goalQueries(transport).milestone("u", "t"));
    // The open sheet watches the read, so invalidating refetches it.
    const unwatch = new QueryObserver(cache, goalQueries(transport).milestone("u", "t")).subscribe(() => undefined);
    const writes = goalMutations(transport, cache, "u");
    const on = { goalId: "g", criteria: [] }, one = { goalId: "g", criteria: [{ text: "A", done: false }] };
    const first = writes.setMilestone("t", on);
    await new Promise(resolve => setTimeout(resolve, 0));
    const second = writes.setMilestone("t", one);
    await first;
    // The switch's save finished, but the added criterion is still what the sheet shows.
    expect(cache.getQueryData(goalKeys.milestone("u", "t"))).toEqual(one);
    await second;
    expect(saved).toEqual([on, one]);
    expect(cache.getQueryData(goalKeys.milestone("u", "t"))).toEqual(one);
    unwatch();
  });
});
