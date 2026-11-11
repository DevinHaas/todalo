import { expect, it } from "vitest";
import { THEME_KEY, themeScript } from "./theme";

// Runs the script that ships in <head> against a fake browser and reports
// whether the page ended up dark.
function pageIsDark(visitor: { stored?: string; systemDark: boolean; storageBroken?: boolean }) {
  let dark = false;
  const localStorage = {
    getItem(key: string) {
      if (visitor.storageBroken) throw new Error("storage denied");
      return key === THEME_KEY ? (visitor.stored ?? null) : null;
    },
  };
  const matchMedia = (query: string) => ({
    matches: query === "(prefers-color-scheme: dark)" && visitor.systemDark,
  });
  const document = {
    documentElement: {
      classList: {
        toggle(name: string, on: boolean) {
          if (name === "dark") dark = on;
        },
      },
    },
  };
  new Function("localStorage", "matchMedia", "document", themeScript)(localStorage, matchMedia, document);
  return dark;
}

it("follows a dark system setting on a first visit", () => {
  expect(pageIsDark({ systemDark: true })).toBe(true);
});

it("follows a light system setting on a first visit", () => {
  expect(pageIsDark({ systemDark: false })).toBe(false);
});

it("keeps a remembered light choice on a dark system", () => {
  expect(pageIsDark({ stored: "light", systemDark: true })).toBe(false);
});

it("keeps a remembered dark choice on a light system", () => {
  expect(pageIsDark({ stored: "dark", systemDark: false })).toBe(true);
});

it("falls back to the system setting when storage is blocked", () => {
  expect(pageIsDark({ systemDark: true, storageBroken: true })).toBe(true);
});
