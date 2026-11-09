import { describe, expect, it } from "vitest";
import { LiquidSim, liquidDefaults } from "./liquid";

const blob = { x: 1000, y: 800, w: 24, h: 24, r: 24 };
const bar = { x: 500, y: 790, w: 380, h: 22, r: 10 };

/** Steps at 60 fps until `done` or `seconds` pass; returns the time it took. */
const run = (sim: LiquidSim, seconds: number, done = () => false) => {
  for (let time = 0; time < seconds; time += 1 / 60) { sim.step(1 / 60); if (done()) return time; }
  return seconds;
};

describe("the liquid Coach button", () => {
  it("flows out of the button into the bar and back in; the button never leaves", () => {
    const sim = new LiquidSim(liquidDefaults, { blob, bar });
    run(sim, 1);
    expect(sim.phase).toBe("closed");
    expect(sim.body).toBeNull();

    sim.setOpen(true);
    expect(run(sim, 3, () => sim.arrival() > 0.9)).toBeLessThan(1.2);
    run(sim, 2);
    expect(sim.phase).toBe("open");
    expect(sim.pinches).toBeGreaterThanOrEqual(1); // the neck to the button broke
    expect(sim.body!.w).toBeCloseTo(bar.w, 0);
    expect(Math.hypot(sim.home.x - blob.x, sim.home.y - blob.y)).toBeLessThan(1);
    expect(sim.home.w).toBeCloseTo(blob.w, 0);
    expect(sim.settled()).toBe(true);

    sim.setOpen(false);
    expect(sim.arrival()).toBe(0); // the content hides at once
    expect(run(sim, 4, () => sim.phase === "closed")).toBeLessThan(1.6);
    expect(sim.body).toBeNull(); // merged back into the button
    run(sim, 2);
    expect(sim.home.w).toBeCloseTo(blob.w, 0);
    expect(sim.settled()).toBe(true);
  });

  it("never inverts a shape while the bar gathers, and reverses mid-flow", () => {
    const sim = new LiquidSim({ ...liquidDefaults, viscosity: 0.1 }, { blob, bar });
    sim.setOpen(true); run(sim, 4);
    sim.setOpen(false);
    for (let index = 0; index < 20; index++) { sim.step(1 / 60); expect(sim.body!.w).toBeGreaterThan(1); expect(sim.body!.h).toBeGreaterThan(1); }
    sim.setOpen(true);
    run(sim, 4);
    expect(sim.phase).toBe("open");
    expect(sim.body!.w).toBeCloseTo(bar.w, 0);
  });
});
