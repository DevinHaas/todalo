import { expect, it, vi } from "vitest";
import { firstTimeFor, notifiedFor } from "./ritual-notify";

it("notifiedFor reads what firstTimeFor remembered, without remembering anything itself", () => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => { store.set(key, value); } });
  expect(notifiedFor("u", "checkIn", "2026-11-24")).toBe(false);
  expect(store.size).toBe(0);
  expect(firstTimeFor("u", "checkIn", "2026-11-24")).toBe(true);
  expect(notifiedFor("u", "checkIn", "2026-11-24")).toBe(true);
  expect(notifiedFor("u", "checkIn", "2026-11-25")).toBe(false); // a new period is due again
  vi.unstubAllGlobals();
});
