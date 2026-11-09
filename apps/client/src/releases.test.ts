import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compareVersions, releases, showWhatsNew } from "./releases";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("release check", () => {
  const pkg = JSON.parse(read("../package.json")).version as string;
  const tauri = JSON.parse(read("../src-tauri/tauri.conf.json")).version as string;
  const cargo = read("../src-tauri/Cargo.toml").match(/^version\s*=\s*"([^"]+)"/m)?.[1];

  it("package.json, tauri.conf.json and Cargo.toml agree on the version", () => {
    expect(tauri).toBe(pkg);
    expect(cargo).toBe(pkg);
  });

  it("the newest releases.ts entry is the app's version", () => {
    expect(releases[0]?.version).toBe(pkg);
  });

  it("releases are newest first, each with highlights", () => {
    for (let index = 1; index < releases.length; index++) expect(compareVersions(releases[index - 1]!.version, releases[index]!.version)).toBeGreaterThan(0);
    for (const release of releases) expect(release.highlights.length).toBeGreaterThan(0);
  });
});

describe("What's new after an update", () => {
  it("stays quiet on a first-ever run", () => expect(showWhatsNew("0.1.0", null)).toBe(false));
  it("stays quiet when the version was already seen", () => expect(showWhatsNew("0.2.0", "0.2.0")).toBe(false));
  it("opens when the running version is newer", () => {
    expect(showWhatsNew("0.2.0", "0.1.0")).toBe(true);
    expect(showWhatsNew("0.10.0", "0.9.3")).toBe(true);
  });
  it("stays quiet after a downgrade", () => expect(showWhatsNew("0.1.0", "0.2.0")).toBe(false));
});
