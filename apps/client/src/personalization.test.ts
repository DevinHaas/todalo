import { describe, expect, it } from "vitest";
import { designCode, designProperties, fieldColor, fieldPoint, hexToOklch, oklchToHex, readDesignCode, sidebarOrder, defaultDesign } from "./personalization";

describe("design colours", () => {
  it("round-trips hex through OKLCH", () => {
    for (const hex of ["#dc4c3e", "#a8c3a0", "#4a6fa5", "#ffffff", "#202020"]) {
      const { l, c, h } = hexToOklch(hex);
      expect(oklchToHex(l, c, h)).toBe(hex);
    }
  });

  it("puts a picked colour back where it was picked on the field", () => {
    const point = fieldPoint(fieldColor(0.4, 0.5));
    expect(point.x).toBeCloseTo(0.4, 1);
    expect(point.y).toBeCloseTo(0.5, 1);
  });
});

describe("design → CSS", () => {
  const base = { background: "#ffffff", sidebar: "#fcfaf8" };
  it("leaves the plain theme alone at zero intensity, grain and no accent", () => {
    expect(designProperties(defaultDesign, base)).toEqual({});
  });

  it("tints the sidebar with a gradient and grain, the page faintly, and recolours the accent", () => {
    const css = designProperties({ mode: "dark", colors: ["#a8c3a0", "#4a6fa5"], intensity: 50, grain: 40, accent: "#4a6fa5" }, base);
    expect(css["--design-sidebar"]).toMatch(/^url\("data:image\/svg\+xml,.*linear-gradient\(170deg, color-mix\(in oklch, #fcfaf8 70%, #a8c3a0\), color-mix\(in oklch, #fcfaf8 70%, #4a6fa5\)\)$/);
    expect(css["--color-background"]).toBe("color-mix(in oklch, #ffffff 94%, #a8c3a0)");
    expect(css["--color-brand"]).toBe("#4a6fa5");
  });
});

describe("sharing a design", () => {
  it("copies and pastes a design code, and rejects anything else", () => {
    const design = { mode: "system" as const, colors: ["#a8c3a0"], intensity: 70, grain: 20, accent: null };
    expect(readDesignCode(designCode(design))).toEqual(design);
    expect(readDesignCode("todalo-design:bm9wZQ==")).toBeNull();
    expect(readDesignCode("hello")).toBeNull();
  });
});

describe("sidebar order", () => {
  it("keeps the saved order and puts each entry it lacks right after its default neighbour", () => {
    expect(sidebarOrder({ order: ["projects", "today", "season"], hidden: [] })).toEqual(
      ["rituals", "projects", "today", "upcoming", "filters", "reporting", "more", "favorites", "season", "goals", "inbox"]);
  });
  it("never orders Search: it is pinned under Add task, even in a saved order that has it", () => {
    expect(sidebarOrder({ order: ["today", "search", "inbox"], hidden: [] })).not.toContain("search");
  });
});
