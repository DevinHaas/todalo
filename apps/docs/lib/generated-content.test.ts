import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { keyboardCommands } from "../../../packages/ramble/src/keyboard";
import { ReleaseNotes, ShortcutTable } from "../components/generated-content";
import { releases } from "./releases";
import { UNDOCUMENTED, documentedCommands, helpKeys, shortcutGroups } from "./shortcuts";

const article = (path: string) => readFileSync(new URL(`../content/apps-account/${path}.mdx`, import.meta.url), "utf8");
const escape = (text: string) => renderToStaticMarkup(createElement("span", null, text)).slice(6, -7);

describe("Use keyboard shortcuts", () => {
  it("embeds the generated table", () => {
    expect(article("use-keyboard-shortcuts")).toContain("<ShortcutTable />");
  });

  it("lists every registered command the app ships, and nothing excluded, inert or native", () => {
    const html = renderToStaticMarkup(createElement(ShortcutTable));
    const shipped = keyboardCommands.filter((command) => command.availability === "available" && !UNDOCUMENTED.has(command.id));
    expect(shipped.length).toBeGreaterThan(50);
    for (const command of shipped) expect(html, command.id).toContain(`<td>${escape(command.label)}</td>`);
    for (const command of keyboardCommands.filter((command) => command.availability !== "available")) {
      expect(documentedCommands().map((entry) => entry.id), command.id).not.toContain(command.id);
    }
    expect(shortcutGroups().flatMap((group) => group.rows).every((row) => row.mac.length && row.other.length)).toBe(true);
  });

  it("only leaves out commands that still exist", () => {
    for (const id of UNDOCUMENTED) expect(keyboardCommands.some((command) => command.id === id), id).toBe(true);
  });

  it("writes registry bindings in the help center's key syntax", () => {
    expect(helpKeys("Primary+Shift+r")).toEqual(["Mod+Shift+R"]);
    expect(helpKeys("g then t")).toEqual(["G", "T"]);
    expect(helpKeys("Meta+Backspace")).toEqual(["Mod+⌫"]);
    expect(helpKeys("Ctrl+]")).toEqual(["Ctrl+]"]);
    expect(helpKeys("Primary+-")).toEqual(["Mod+-"]);
  });

  it("shows each platform its own default where the registry has one", () => {
    const row = shortcutGroups().flatMap((group) => group.rows).find((entry) => entry.id === "task.delete")!;
    expect(row.mac).toEqual([["Mod+⌫"]]);
    expect(row.other).toEqual([["Shift+Delete"]]);
  });
});

describe("What's new", () => {
  it("embeds the generated release notes", () => {
    expect(article("whats-new")).toContain("<ReleaseNotes />");
  });

  it("lists every release and every highlight from the client's release notes", () => {
    const html = renderToStaticMarkup(createElement(ReleaseNotes));
    expect(releases.length).toBeGreaterThan(0);
    for (const release of releases) {
      expect(html).toContain(`Version ${release.version}</h2>`);
      for (const line of [...release.highlights, ...(release.changes ?? [])]) expect(html).toContain(escape(line));
    }
  });
});
