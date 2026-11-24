import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { customCssPrompt, themeRegions, themeVariables } from "./theme-reference";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const theme = read("./ui/theme.css");
const design = read("./personalization.ts");
const markup = (readdirSync(new URL(".", import.meta.url), { recursive: true }) as string[])
  .filter(file => file.endsWith(".tsx")).map(file => read(`./${file}`)).join("\n");
const prompt = customCssPrompt();

describe("theme reference", () => {
  it("lists only variables the app defines", () => {
    // Defined in theme.css, or set by personalization.ts (its design props, or a rule like the wallpaper's).
    const missing = themeVariables.filter(({ name }) => !theme.includes(`${name}:`) && !design.includes(`"${name}"`) && !design.includes(`${name}:`));
    expect(missing.map(v => v.name)).toEqual([]);
  });

  it("lists every design variable the app sets", () => {
    const set = [design.matchAll(/"(--design-[a-z-]+)"/g), design.matchAll(/(--design-[a-z-]+):/g), theme.matchAll(/(--design-[a-z-]+):/g)].flatMap(found => [...found].map(match => match[1]!));
    expect([...new Set(set)].filter(name => !themeVariables.some(v => v.name === name))).toEqual([]);
  });

  it("lists only regions the app renders", () => {
    const missing = themeRegions.filter(({ region }) => !markup.includes(`data-region="${region}"`));
    expect(missing.map(r => r.region)).toEqual([]);
  });

  it("names are unique", () => {
    expect(new Set(themeVariables.map(v => v.name)).size).toBe(themeVariables.length);
    expect(new Set(themeRegions.map(r => r.region)).size).toBe(themeRegions.length);
  });

  it("prompt lists every variable and region, forbids network loads and stays short", () => {
    for (const { name } of themeVariables) expect(prompt).toContain(`- ${name}:`);
    for (const { region } of themeRegions) expect(prompt).toContain(`- ${region}:`);
    expect(prompt).toContain("No @import.");
    expect(prompt).toContain("No remote url(): only data: URLs");
    expect(prompt.trimEnd().endsWith("## My theme\n<describe it, paste reference images or links>")).toBe(true);
    expect(prompt.length).toBeLessThan(6000);
  });
});
