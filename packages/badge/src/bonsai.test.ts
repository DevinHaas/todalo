import { describe, expect, it } from "vitest";
import { BONSAI_STYLES, bonsaiTraits, buildBonsai } from "./bonsai";

describe("bonsai", () => {
  it("gives a member the same tree every time", () => {
    expect(bonsaiTraits(42)).toEqual(bonsaiTraits(42));
    const a = buildBonsai(bonsaiTraits(42)), b = buildBonsai(bonsaiTraits(42));
    expect(Array.from(a.bark.attributes.position.array)).toEqual(Array.from(b.bark.attributes.position.array));
  });

  it("spreads members across styles and pots", () => {
    const traits = Array.from({ length: 200 }, (_, i) => bonsaiTraits(i + 1));
    expect(new Set(traits.map(t => t.style)).size).toBe(BONSAI_STYLES.length);
    expect(new Set(traits.map(t => t.pot)).size).toBeGreaterThanOrEqual(5);
  });

  it("builds finite geometry for every style", () => {
    for (const style of BONSAI_STYLES) {
      const g = buildBonsai(bonsaiTraits(7, style));
      expect(g.tufts.length).toBeGreaterThan(20);
      expect(Array.from(g.bark.attributes.position.array).every(Number.isFinite)).toBe(true);
    }
  });
});
