import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// The screen reads and saves through the app runtime; the test seeds the cache instead.
vi.mock("./runtime", () => ({
  personalization: { save: async (document: unknown) => document },
  personalizationReads: { document: (userId: string) => ({ queryKey: ["user", userId, "personalization"], queryFn: async () => null }) },
}));

import { AppearanceSettingsScreen, grainSpecks } from "./personalization-screens";
import { defaultDesign, defaultPersonalization, personalizationKeys, type CustomCssDto, type DesignDto } from "./personalization";

const render = (design: DesignDto, wallpaper: string | null = null, customCss: CustomCssDto | null = null) => {
  const cache = new QueryClient();
  cache.setQueryData(personalizationKeys.document("me"), { ...defaultPersonalization, design, wallpaper, customCss });
  return renderToStaticMarkup(createElement(QueryClientProvider, { client: cache }, createElement(AppearanceSettingsScreen, { userId: "me" })));
};
const sage: DesignDto = { ...defaultDesign, mode: "light", colors: ["#a8c3a0", "#d6e2c9"], intensity: 55, grain: 25, accent: "#4f7a55" };
const tag = (html: string, pattern: RegExp) => html.match(new RegExp(`<[^>]*${pattern.source}[^>]*>`))?.[0] ?? "";

describe("Settings › Appearance", () => {
  it("draws grain as specks that thicken from left to right", () => {
    const count = (from: number, to: number) => grainSpecks.filter(speck => speck.x >= from && speck.x < to).length;
    expect(count(0, 0.1)).toBeLessThan(count(0.45, 0.55));
    expect(count(0.45, 0.55)).toBeLessThan(count(0.9, 1));
  });

  it("keeps the grain slider's name and value under its picture, and inks the specks up to the value", () => {
    const html = render(sage);
    const grain = tag(html, /aria-label="Grain"/);
    expect(grain).toContain('type="range"');
    expect(grain).toContain('aria-valuenow="25"');
    const track = html.match(/<svg[^>]*data-grain-track[^]*?<\/svg>/)?.[0] ?? "";
    expect(html).toMatch(/aria-hidden="true"[^>]*><svg[^>]*data-grain-track/);
    expect(track.match(/fill-foreground\/85/g)?.length).toBe(grainSpecks.filter(speck => speck.x <= 0.25).length);
  });

  it("shows presets as one row of swatches with the matching one pressed, or Custom", () => {
    const html = render(sage);
    expect(tag(html, /aria-label="Use Sage"/)).toContain('aria-pressed="true"');
    expect(tag(html, /aria-label="Use Ocean"/)).toContain('aria-pressed="false"');
    const custom = render({ ...sage, grain: 26 });
    expect(custom.match(/aria-label="Ready-made designs"[^]*?<\/div>/)?.[0]).not.toContain('aria-pressed="true"');
    expect(custom).toContain(">Custom<");
  });

  it("picks the accent from a radio group, with Todalo red for no accent and a free colour input", () => {
    expect(tag(render({ ...sage, accent: null }), /aria-label="Todalo red"/)).toContain('aria-checked="true"');
    const custom = render({ ...sage, accent: "#123456" });
    expect(custom).not.toContain('aria-checked="true"');
    expect(tag(custom, /aria-label="Any accent colour"/)).toContain('value="#123456"');
  });

  it("offers a terminal-style look that sets font, corners, borders and glass, with a square swatch", () => {
    const terminal = { ...defaultDesign, colors: ["#b3a679", "#6f6448"], intensity: 60, grain: 15, accent: "#6b5c1f", font: "jetbrains-mono", corners: "sharp", borders: "strong", borderColor: "#8f8458", glass: 50 } as const;
    const html = render({ ...terminal, mode: "dark", colors: [...terminal.colors] });
    expect(tag(html, /aria-label="Use Terminal"/)).toMatch(/aria-pressed="true".*rounded-\[3px\]|rounded-\[3px\].*aria-pressed="true"/);
    expect(html).toContain(">Terminal<");
    // A colour preset is a whole look: Sage with the terminal font is not Sage.
    expect(tag(render({ ...sage, font: "jetbrains-mono" }), /aria-label="Use Sage"/)).toContain('aria-pressed="false"');
  });

  it("shows corners and borders as pressed toggles, and glass Off until it is raised", () => {
    const html = render({ ...sage, corners: "round", borders: "none" });
    expect(html).toMatch(/aria-pressed="true"[^>]*>Round</);
    expect(html).toMatch(/aria-pressed="true"[^>]*>None</);
    expect(tag(html, /aria-label="Glass"/)).toContain('aria-valuenow="0"');
    expect(tag(html, /aria-label="Border colour"/)).toContain('type="color"');
  });

  it("switches the background with Colour and Image tabs, rendering only the active one", () => {
    const colour = render(sage, "data:image/jpeg;base64,/9j/4AAQ");
    expect(colour).toMatch(/role="tablist"[^>]*aria-label="Background"/);
    expect(tag(colour, /data-design-background-tab="color"/)).toContain('aria-selected="true"');
    expect(tag(colour, /data-design-background-tab="image"/)).toContain('aria-selected="false"');
    expect(colour).toContain("data-design-field");
    expect(colour).not.toContain("data-wallpaper-preview");
    const image = render({ ...sage, background: "image" });
    expect(tag(image, /data-design-background-tab="image"/)).toContain('aria-selected="true"');
    expect(image).not.toContain("data-design-field");
    expect(image).not.toContain('aria-label="Ready-made designs"');
    expect(image).toContain(">Choose an image<");
  });

  it("previews the wallpaper and nudges towards glass when it is hidden", () => {
    const jpeg = "data:image/jpeg;base64,/9j/4AAQ";
    const hidden = render({ ...sage, background: "image" }, jpeg);
    expect(hidden).toContain("data-wallpaper-preview");
    expect(hidden).toContain("Raise glass to see your wallpaper.");
    expect(tag(hidden, /aria-label="Remove the wallpaper"/)).toBeTruthy();
    expect(render({ ...sage, background: "image", glass: 40 }, jpeg)).not.toContain("Raise glass");
    expect(render(sage)).not.toContain("data-wallpaper-preview");
  });

  it("says Off instead of 0%", () => {
    expect(render({ ...sage, glass: 30 })).not.toContain(">Off<");
    const off = render({ ...sage, intensity: 0, glass: 30 });
    expect(off).toContain(">Off<");
    expect(off).toContain(">25%<");
  });

  it("tucks custom CSS into a collapsed Advanced section until there is some", () => {
    const empty = render(sage);
    const details = tag(empty, /class="group\/advanced"/);
    expect(details).not.toContain(" open");
    expect(empty).toMatch(/>Custom CSS<\/h3>.*>Advanced</);
    expect(tag(empty, /data-custom-css-switch/)).toMatch(/aria-checked="false"/);
    expect(tag(empty, /data-custom-css-switch/)).toMatch(/aria-disabled="true"|data-disabled/);
    expect(empty).not.toContain(">Remove<");
    expect(empty).toContain(">Upload .css<");
    expect(empty).toContain(">Copy prompt<");
    expect(empty).toMatch(/<input type="file" accept="\.css,text\/css"/);
    expect(tag(empty, /href="https:\/\/help\.todalo\.app\/apps-account\/customize-with-css"/)).toContain('target="_blank"');
  });

  it("shows the account's custom CSS open, with its switch, editor, Remove and what was left out", () => {
    const html = render(sage, null, { css: ":root { --color-brand: red }\n.a { background: url(https://example.com/x.png) }", enabled: true });
    expect(tag(html, /class="group\/advanced"/)).toContain(" open");
    expect(tag(html, /data-custom-css-switch/)).toContain('aria-checked="true"');
    expect(html).toMatch(/<textarea[^>]*data-custom-css-editor[^>]*>:root \{ --color-brand: red \}/);
    expect(html).toContain(">Remove<");
    expect(html).toContain("One part was left out: only data: URLs load, and no @import.");
    expect(tag(render(sage, null, { css: ":root{}", enabled: false }), /data-custom-css-switch/)).toContain('aria-checked="false"');
  });
});
