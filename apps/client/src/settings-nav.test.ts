import { describe, expect, it } from "vitest";
import { legacySettingsPath, searchSettings, settingsBackground } from "./settings-nav";
import type { Location } from "react-router";

const at = (pathname: string, state: unknown = null) => ({ pathname, search: "", hash: "", state, key: "k" }) as Location;

describe("settings", () => {
  it("search filters categories by name and by the settings inside", () => {
    expect(searchSettings("").map((r) => r.section.id)).toEqual(["account", "general", "theme", "keyboard-shortcuts", "rituals", "calendars", "integrations"]);
    expect(searchSettings("check-in").map((r) => [r.section.id, r.matches])).toEqual([["rituals", ["Check-in"]]]);
    expect(searchSettings("cal").map((r) => [r.section.id, r.matches])).toEqual([["calendars", []]]);
    expect(searchSettings("todoist").map((r) => [r.section.id, r.matches])).toEqual([["integrations", ["Import from Todoist"]]]);
    expect(searchSettings(" DARK ").map((r) => r.section.id)).toEqual(["theme"]);
    expect(searchSettings("nothing here")).toEqual([]);
  });

  it("old /account anchors land on their section", () => {
    expect(legacySettingsPath("")).toBe("/settings/account");
    expect(legacySettingsPath("#import")).toBe("/settings/integrations");
    expect(legacySettingsPath("#keyboard-shortcuts")).toBe("/settings/keyboard-shortcuts");
  });

  it("settings opens over the screen it came from, else Today", () => {
    const background = { pathname: "/projects/p", search: "", hash: "" };
    expect(settingsBackground(at("/settings/theme", { background }))).toBe(background);
    expect(settingsBackground(at("/settings/theme"))?.pathname).toBe("/today");
    expect(settingsBackground(at("/today"))).toBeUndefined();
  });
});
