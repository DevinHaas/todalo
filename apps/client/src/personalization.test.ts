import { describe, expect, it } from "vitest";
import { designCode, designProperties, fieldColor, fieldPoint, grainImage, hexToOklch, oklchToHex, readDesignCode, sidebarOrder, defaultDesign, wallpaperCss } from "./personalization";

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
    const css = designProperties({ ...defaultDesign, mode: "dark", colors: ["#a8c3a0", "#4a6fa5"], intensity: 50, grain: 40, accent: "#4a6fa5" }, base);
    expect(css["--design-sidebar"]).toBe("var(--design-grain), linear-gradient(170deg, color-mix(in oklch, #fcfaf8 70%, #a8c3a0), color-mix(in oklch, #fcfaf8 70%, #4a6fa5))");
    expect(css["--design-grain"]).toMatch(/^url\("data:image\/svg\+xml,/);
    expect(css["--color-background"]).toBe("color-mix(in oklch, #ffffff 94%, #a8c3a0)");
    expect(css["--color-brand"]).toBe("#4a6fa5");
  });

  it("draws grain as light and dark specks whose strength rises on a gentle curve, and none at 0", () => {
    const opacity = (amount: number) => Number(/opacity%3D'([\d.]+)'/.exec(grainImage(amount))?.[1]);
    expect(opacity(0)).toBe(0);
    expect(opacity(100)).toBe(0.15);
    expect(opacity(50)).toBeCloseTo(0.089, 3); // 0.5 ** 0.75: calmer, still clearly there
    expect(opacity(25)).toBeGreaterThan(0.25 * 0.15);
    expect(decodeURIComponent(grainImage(100))).toMatch(/result='light'.*result='dark'/);
    expect(designProperties({ ...defaultDesign, grain: 0 }, base)["--design-grain"]).toBeUndefined();
  });

  it("swaps the font, scales the corners and draws borders in the chosen colour", () => {
    const css = designProperties({ ...defaultDesign, font: "jetbrains-mono", corners: "sharp", borders: "strong", borderColor: "#8f8458" }, base);
    expect(css["--font-sans"]).toMatch(/^"JetBrains Mono Variable", .*monospace$/);
    expect(css["--design-corners"]).toBe("0");
    expect(css["--color-border"]).toBe("color-mix(in oklch, #8f8458 55%, transparent)");
    expect(css["--design-panel-border"]).toBe("#8f8458"); // panel edges in full, lines inside a step quieter
    expect(designProperties({ ...defaultDesign, corners: "round", borders: "strong" }, base)["--color-border"]).toBe("color-mix(in oklch, var(--color-foreground) 26%, transparent)");
    const none = designProperties({ ...defaultDesign, borders: "none", borderColor: "#8f8458" }, base);
    expect(none["--design-panel-border"]).toBe("transparent");
    expect(none["--color-border"]).toBeUndefined(); // fields keep their outline
  });

  it("with glass, makes the sidebar see-through and paints the colours as the wash behind it", () => {
    const css = designProperties({ ...defaultDesign, colors: ["#5d6b85", "#8fa9c4"], glass: 50 }, base, true);
    expect(css["--design-glass"]).toBe("60%");
    expect(css["--design-blur"]).toBe("8px");
    expect(css["--design-sidebar"]).toBe("linear-gradient(color-mix(in oklch, #fcfaf8 var(--design-glass), transparent), color-mix(in oklch, #fcfaf8 var(--design-glass), transparent))");
    expect(css["--design-backdrop"]).toBe("linear-gradient(160deg, color-mix(in oklch, #5d6b85, black 55%), color-mix(in oklch, #8fa9c4, black 55%))");
    expect(designProperties({ ...defaultDesign, glass: 0 }, base)).toEqual({});
  });

  it("with the image background, leaves the colours out: no tint, no wash, just glass over the picture", () => {
    const css = designProperties({ ...defaultDesign, colors: ["#5d6b85"], intensity: 60, glass: 50, background: "image" }, base);
    expect(css["--design-backdrop"]).toBeUndefined();
    expect(css["--color-background"]).toBeUndefined();
    expect(css["--design-sidebar"]).toBe("linear-gradient(color-mix(in oklch, #fcfaf8 var(--design-glass), transparent), color-mix(in oklch, #fcfaf8 var(--design-glass), transparent))");
    expect(css["--design-glass"]).toBe("60%");
  });

  it("sets the wallpaper on the backdrop layer only, not on every element", () => {
    expect(wallpaperCss("data:image/webp;base64,UklGRg==")).toBe('html::before{--design-wallpaper:url("data:image/webp;base64,UklGRg==")}');
  });
});

describe("sharing a design", () => {
  it("copies and pastes a design code, and rejects anything else", () => {
    const design = { ...defaultDesign, mode: "system" as const, colors: ["#a8c3a0"], intensity: 70, grain: 20, font: "plex-mono" as const, glass: 30, background: "image" as const };
    expect(readDesignCode(designCode(design))).toEqual(design);
    expect(readDesignCode("todalo-design:bm9wZQ==")).toBeNull();
    expect(readDesignCode("hello")).toBeNull();
  });

  it("still imports a code shared before font, corners, borders and glass, with today's look for them", () => {
    const old = `todalo-design:${btoa(JSON.stringify({ mode: "dark", colors: ["#a8c3a0"], intensity: 70, grain: 20, accent: null }))}`;
    expect(readDesignCode(old)).toEqual({ ...defaultDesign, mode: "dark", colors: ["#a8c3a0"], intensity: 70, grain: 20 });
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
