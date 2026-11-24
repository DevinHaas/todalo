// Settings › Appearance › Accent recolours the whole app: every brand-red surface reads the brand
// tokens (theme.css), which personalization.ts overrides. This guards against the red coming back
// as a literal (the Coach button once was one) or as a token the accent does not reach.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { defaultDesign, designProperties } from "./personalization";

const src = fileURLToPath(new URL(".", import.meta.url));
const files = (dir: string): string[] => readdirSync(dir).flatMap(name => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? files(path) : /\.(css|tsx?)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
});
const theme = readFileSync(join(src, "ui/theme.css"), "utf8");
const tokenBlock = (css: string, from: string) => css.slice(css.indexOf(from), css.indexOf("}", css.indexOf(from)));
const brandOf = (block: string) => [...block.matchAll(/--color-brand[\w-]*:\s*(#[0-9a-f]{6})/gi)].map(match => match[1]!.toLowerCase());
const brandReds = [...brandOf(tokenBlock(theme, "@theme static")), ...brandOf(tokenBlock(theme, ":root.dark"))];

/** Where the red stays on purpose: the brand tokens themselves, semantic reds that share a value, the default's swatch and pickers. */
const allowed: Record<string, RegExp> = {
  "ui/theme.css": /^\s*--color-(brand[\w-]*|destructive|priority-1):/,
  "personalization-screens.tsx": /Todalo red|type="color"/,
  "liquid-panel.tsx": /saved\.blobColor/,
  "ui-gallery.tsx": /useState\(/,
};

describe("the accent reaches every brand red", () => {
  it("knows the brand reds", () => expect(brandReds).toEqual(expect.arrayContaining(["#dc4c3e", "#de4c4a"])));

  it("has no brand red literal outside the theme's brand tokens", () => {
    const found: string[] = [];
    for (const path of files(src)) {
      const name = relative(src, path);
      readFileSync(path, "utf8").split("\n").forEach((line, index) => {
        if (allowed[name]?.test(line)) return;
        // The brand hexes, and warm-red oklch literals (hue 15-35) that are not a priority's flag.
        const red = brandReds.some(hex => line.toLowerCase().includes(hex))
          || [...line.matchAll(/oklch\(\s*[\d.]+\s+(0?\.\d+)\s+([\d.]+)/g)].some(([, c, h]) => Number(c) > 0.1 && Number(h) >= 15 && Number(h) <= 35 && !/priority/.test(line));
        if (red) found.push(`${name}:${index + 1}`);
      });
    }
    expect(found).toEqual([]);
  });

  it("derives links and selection from the brand tokens, light and dark", () => {
    for (const block of [tokenBlock(theme, "@theme static"), tokenBlock(theme, ":root.dark")]) {
      expect(block).toMatch(/--color-link:\s*var\(--color-brand/);
      expect(block).toMatch(/--color-selected:\s*var\(--color-brand-tint\)/);
    }
  });

  it("overrides every brand token for an accent", () => {
    for (const dark of [false, true]) {
      const out = designProperties({ ...defaultDesign, accent: "#14b8a6" }, { background: "#fff", sidebar: "#fafafa" }, dark);
      for (const token of ["--color-brand", "--color-primary", "--color-brand-hover", "--color-brand-tint", "--color-brand-tint-foreground"]) expect(out[token]).toContain("#14b8a6");
    }
  });
});
