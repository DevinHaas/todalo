import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { AccountTransportError } from "./errors";
import { seasonKeys, seasonMutations, seasonQueries, type CurrentSeasonDto, type SeasonGoalPatch, type SeasonTransport } from "./seasons";

const goal = { id: "sg", goalId: "beta", title: "Ship the beta", color: "blue", archived: false, tier: "primary", target: "Ten testers", carriedFromId: null } as const;
const current = (): CurrentSeasonDto => ({ season: { id: "s1", startDate: "2026-11-07", lengthDays: 84, endedAt: null, goals: [{ ...goal }], progress: { phase: "running", day: 1, length: 84, daysLeft: 83, startsIn: 0 } } as CurrentSeasonDto["season"] });

/** The server answers only once `release` is called, as on a slow network. */
function slowServer(fail = false) {
  let release = () => undefined as void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const transport = {
    current: async () => current(),
    updateGoal: async (_season: string, _goal: string, patch: SeasonGoalPatch) => { await gate; return fail ? null : { ...goal, ...patch }; },
  } as unknown as SeasonTransport;
  return { transport, release: () => release() };
}

describe("season goal tier and target changes", () => {
  // The user's report: switching a goal to Secondary left it under Primary for ~2 s
  // (write + refetch), so it looked like it only moved after a reload.
  it.each([
    ["tier", { tier: "secondary" }],
    ["target", { target: "Twenty testers" }],
  ] as const)("show the new %s before the server answers", async (_name, patch) => {
    const { transport, release } = slowServer();
    const cache = new QueryClient();
    await cache.fetchQuery(seasonQueries(transport).current("u"));
    const write = seasonMutations(transport, cache, "u").updateGoal("s1", "beta", patch);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(cache.getQueryData<CurrentSeasonDto>(seasonKeys.current("u"))?.season?.goals[0]).toMatchObject(patch);
    release();
    await write;
  });

  it("puts the old value back when the server refuses", async () => {
    const { transport, release } = slowServer(true);
    const cache = new QueryClient();
    await cache.fetchQuery(seasonQueries(transport).current("u"));
    const write = seasonMutations(transport, cache, "u").updateGoal("s1", "beta", { tier: "secondary" });
    release();
    await expect(write).rejects.toBeInstanceOf(AccountTransportError);
    expect(cache.getQueryData<CurrentSeasonDto>(seasonKeys.current("u"))?.season?.goals[0]?.tier).toBe("primary");
  });
});
