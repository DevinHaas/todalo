import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSettings, setSmartDateRecognition, updateSettings } from "./settings";
import { settingsInput } from "./settings-input";

const boundary = vi.hoisted(() => ({ rows: {} as Record<string, Record<string, unknown>[]> }));
vi.mock("@todalo/db", async () => {
  const { relationalBoundary } = await import("../../../apps/web/lib/testing/relational-boundary");
  return relationalBoundary(boundary);
});

beforeEach(() => { boundary.rows = { user_settings: [{ userId: "bob", smartDateRecognitionEnabled: false }] }; });

describe("account settings", () => {
  it("defaults smart dates on without a row and keeps each account's choice separate", async () => {
    expect(await getSettings("alice")).toEqual({ smartDateRecognition: true, shareEventTitles: false });
    expect(await setSmartDateRecognition("alice", false)).toEqual({ smartDateRecognition: false, shareEventTitles: false });
    expect(await getSettings("alice")).toEqual({ smartDateRecognition: false, shareEventTitles: false });
    expect(await getSettings("bob")).toEqual({ smartDateRecognition: false, shareEventTitles: false });
    await setSmartDateRecognition("alice", true);
    expect(await getSettings("alice")).toEqual({ smartDateRecognition: true, shareEventTitles: false });
    expect(await getSettings("bob")).toEqual({ smartDateRecognition: false, shareEventTitles: false });
    expect(boundary.rows.user_settings.filter(row => row.userId === "alice")).toHaveLength(1);
  });

  it("ticket 28: keeps Share event titles off by default and changes only what is sent", async () => {
    expect(await updateSettings("bob", { shareEventTitles: true })).toEqual({ smartDateRecognition: false, shareEventTitles: true });
    expect(await getSettings("bob")).toEqual({ smartDateRecognition: false, shareEventTitles: true });
    expect(await getSettings("alice")).toEqual({ smartDateRecognition: true, shareEventTitles: false });
  });

  it("accepts only the boolean preferences", () => {
    expect(settingsInput.safeParse({ smartDateRecognition: false }).success).toBe(true);
    expect(settingsInput.safeParse({ shareEventTitles: true }).success).toBe(true);
    for (const body of [{}, { smartDateRecognition: "false" }, { smartDateRecognition: true, userId: "bob" }, null]) {
      expect(settingsInput.safeParse(body).success).toBe(false);
    }
  });
});
