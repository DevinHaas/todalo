import { describe, expect, it } from "vitest";
import { LiquidSim, liquidDefaults } from "./liquid";

const blob = { x: 1000, y: 800, w: 24, h: 24, r: 24 };
const bar = { x: 500, y: 790, w: 380, h: 22, r: 10 };
const close = { x: 910, y: 790, w: 15, h: 15, r: 15 };

/** Steps at 60 fps until `done` or `seconds` pass; returns the time it took. */
const run = (sim: LiquidSim, seconds: number, done = () => false) => {
  for (let time = 0; time < seconds; time += 1 / 60) { sim.step(1 / 60); if (done()) return time; }
  return seconds;
};

describe("the liquid Coach button", () => {
  it("flows into the bar, pinches off on the way, buds the × and flows back", () => {
    const sim = new LiquidSim(liquidDefaults, { blob, bar, close });
    run(sim, 1);
    expect(sim.phase).toBe("closed");

    sim.setOpen(true);
    const budded = run(sim, 3, () => sim.arrival().close > 0.9);
    expect(budded).toBeLessThan(2);
    run(sim, 2);
    expect(sim.phase).toBe("open");
    expect(sim.pinches).toBeGreaterThanOrEqual(2); // the remnant's neck and the ×'s
    expect(sim.body.w).toBeCloseTo(bar.w, 0);
    expect(Math.hypot(sim.drop!.x - close.x, sim.drop!.y - close.y)).toBeLessThan(1);
    expect(sim.settled()).toBe(true);

    sim.setOpen(false);
    expect(sim.arrival().bar).toBe(0); // the content hides at once
    run(sim, 4);
    expect(sim.phase).toBe("closed");
    expect(sim.drop).toBeNull();
    expect(Math.hypot(sim.body.x - blob.x, sim.body.y - blob.y)).toBeLessThan(1);
    expect(sim.body.w).toBeCloseTo(blob.w, 0);
    expect(sim.settled()).toBe(true);
  });

  it("never inverts a shape while the bar gathers", () => {
    const sim = new LiquidSim({ ...liquidDefaults, viscosity: 0.1 }, { blob, bar, close });
    sim.setOpen(true); run(sim, 4);
    sim.setOpen(false);
    for (let index = 0; index < 240; index++) { sim.step(1 / 60); expect(sim.body.w).toBeGreaterThan(1); expect(sim.body.h).toBeGreaterThan(1); }
  });
});
