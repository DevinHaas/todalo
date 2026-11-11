import { expect, it } from "vitest";
import { defaultPlatform, isPlatform, keyLabel, keyStyle, needsPlatformSwitcher, PLATFORM_KEY, PLATFORMS, platformScript, platformStyles, resolvePlatform } from "./platform";

// "Reported OS" is what the browser says: navigator.userAgentData.platform
// ("macOS", "Windows") or navigator.platform ("MacIntel", "Win32").

it("defaults to Mac when the browser reports macOS", () => {
  expect(defaultPlatform("macOS")).toBe("mac");
  expect(defaultPlatform("MacIntel")).toBe("mac");
});

it("defaults to Web on every other system", () => {
  expect(defaultPlatform("Windows")).toBe("web");
  expect(defaultPlatform("Win32")).toBe("web");
  expect(defaultPlatform("Linux x86_64")).toBe("web");
  expect(defaultPlatform("iPhone")).toBe("web");
  expect(defaultPlatform("")).toBe("web");
});

it("keeps a stored choice over the default", () => {
  expect(resolvePlatform("web", "macOS")).toBe("web");
  expect(resolvePlatform("mac", "Windows")).toBe("mac");
});

it("uses the default when nothing usable is stored", () => {
  expect(resolvePlatform(null, "macOS")).toBe("mac");
  expect(resolvePlatform(null, "Windows")).toBe("web");
  // A value this build does not know (hand-edited, or a platform since removed).
  expect(resolvePlatform("amiga", "macOS")).toBe("mac");
});

it("shows Mac keys for the Mac platform on any system", () => {
  expect(keyStyle("mac", "macOS")).toBe("mac");
  expect(keyStyle("mac", "Windows")).toBe("mac");
});

it("shows Ctrl-style keys for Web on Windows and Linux", () => {
  expect(keyStyle("web", "Windows")).toBe("ctrl");
  expect(keyStyle("web", "Linux x86_64")).toBe("ctrl");
});

it("shows Mac keys for Web on macOS", () => {
  expect(keyStyle("web", "MacIntel")).toBe("mac");
});

it("writes a shortcut with Mac symbols, modifiers in Apple's order", () => {
  expect(keyLabel("Mod+K", "mac")).toBe("⌘K");
  expect(keyLabel("Mod+Shift+C", "mac")).toBe("⇧⌘C");
  expect(keyLabel("Ctrl+Alt+Enter", "mac")).toBe("⌃⌥Enter");
});

it("writes a shortcut with Ctrl-style names joined by plus signs", () => {
  expect(keyLabel("Mod+K", "ctrl")).toBe("Ctrl+K");
  expect(keyLabel("Mod+Shift+C", "ctrl")).toBe("Ctrl+Shift+C");
  expect(keyLabel("Alt+Enter", "ctrl")).toBe("Alt+Enter");
});

it("writes a key without modifiers the same way on both", () => {
  expect(keyLabel("Q", "mac")).toBe("Q");
  expect(keyLabel("Q", "ctrl")).toBe("Q");
  expect(keyLabel("?", "mac")).toBe("?");
});

it("accepts the plus key itself", () => {
  expect(keyLabel("Mod++", "mac")).toBe("⌘+");
  expect(keyLabel("Mod++", "ctrl")).toBe("Ctrl++");
});

it("needs the switcher when the article has a platform block", () => {
  const article = `Open the task.\n\n<Platform on="mac">\n\nPress the menu bar icon.\n\n</Platform>\n`;
  expect(needsPlatformSwitcher(article)).toBe(true);
});

it("does not need the switcher when the article is the same on every platform", () => {
  expect(needsPlatformSwitcher("Press <Kbd keys=\"Mod+K\" /> to search.\n")).toBe(false);
  expect(needsPlatformSwitcher("Todalo runs on every platform.\n")).toBe(false);
  expect(needsPlatformSwitcher("<PlatformList />\n")).toBe(false);
});

it("ignores a platform block that is only shown as example code", () => {
  const article = "Authors write:\n\n```mdx\n<Platform on=\"mac\">Mac only</Platform>\n```\n";
  expect(needsPlatformSwitcher(article)).toBe(false);
});

it("validates stored choices without accepting unknown or non-string values", () => {
  for (const platform of PLATFORMS) expect(isPlatform(platform)).toBe(true);
  for (const value of [undefined, null, 1, {}, "", "Mac", "ios"]) expect(isPlatform(value)).toBe(false);
});

it("shows one Ctrl when both Mod and Ctrl name the same physical key", () => {
  expect(keyLabel("Mod+Ctrl+K", "ctrl")).toBe("Ctrl+K");
  expect(keyLabel("Mod+Ctrl+K", "mac")).toBe("⌃⌘K");
  expect(keyLabel(" shift + MOD + K ", "mac")).toBe("⇧⌘K");
});

it("detects the public PlatformContent component, including multiline props", () => {
  expect(needsPlatformSwitcher('<PlatformContent\n  on="web"\n>Browser steps</PlatformContent>')).toBe(true);
  expect(needsPlatformSwitcher('<PlatformContent on="mac" />')).toBe(true);
  expect(needsPlatformSwitcher("<PlatformContentList />")).toBe(false);
  expect(needsPlatformSwitcher('<Steps>\n    <PlatformContent on="mac">Mac steps</PlatformContent>\n</Steps>')).toBe(true);
});

it("ignores inline code, comments and frontmatter mentioning the component", () => {
  expect(needsPlatformSwitcher('Use `<Platform on="mac">` to add steps.')).toBe(false);
  expect(needsPlatformSwitcher('Use ``<PlatformContent on="web" />``.')).toBe(false);
  expect(needsPlatformSwitcher('<!-- <Platform on="mac" /> -->')).toBe(false);
  expect(needsPlatformSwitcher('{/* <PlatformContent on="mac" /> */}')).toBe(false);
  expect(needsPlatformSwitcher('---\ntitle: \'<Platform on="mac" />\'\n---\nAn article.')).toBe(false);
});

it("handles tilde fences, nested fence examples, CRLF and unterminated fences", () => {
  expect(needsPlatformSwitcher('~~~mdx\n<Platform on="mac" />\n~~~')).toBe(false);
  expect(needsPlatformSwitcher('````mdx\n```\n<Platform on="mac" />\n```\n````')).toBe(false);
  expect(needsPlatformSwitcher('```mdx\r\n<Platform on="mac" />\r\n```')).toBe(false);
  expect(needsPlatformSwitcher('```mdx\n<PlatformContent on="mac" />')).toBe(false);
  expect(needsPlatformSwitcher('~~~mdx\nAn example\n~~~\n<Platform on="mac" />')).toBe(true);
});

type Visitor = {
  stored?: string;
  reportedOS?: string;
  legacyOS?: string;
  existingPlatform?: string;
  storageBroken?: boolean;
};

function pagePlatform(visitor: Visitor) {
  const attributes: Record<string, string> = {};
  if (visitor.existingPlatform) attributes["data-platform"] = visitor.existingPlatform;
  const document = {
    documentElement: {
      getAttribute: (name: string) => attributes[name] ?? null,
      setAttribute: (name: string, value: string) => { attributes[name] = value; },
    },
  };
  const localStorage = {
    getItem(key: string) {
      if (visitor.storageBroken) throw new Error("storage denied");
      return key === PLATFORM_KEY ? visitor.stored ?? null : null;
    },
  };
  const navigator = {
    platform: visitor.legacyOS,
    userAgentData: visitor.reportedOS === undefined ? undefined : { platform: visitor.reportedOS },
  };
  new Function("localStorage", "navigator", "document", platformScript)(localStorage, navigator, document);
  return attributes;
}

it("initializes platform and modifier style before hydration using the pure rules", () => {
  for (const reportedOS of ["macOS", "MacIntel", "Windows", "Linux x86_64", "iPhone", ""]) {
    for (const stored of [undefined, "web", "mac", "amiga"]) {
      const platform = resolvePlatform(stored ?? null, reportedOS);
      expect(pagePlatform({ reportedOS, stored })).toEqual({
        "data-platform": platform,
        "data-key-style": keyStyle(platform, reportedOS),
      });
    }
  }
});

it("uses the legacy OS report when modern hints are absent or empty", () => {
  expect(pagePlatform({ legacyOS: "MacIntel" })["data-platform"]).toBe("mac");
  expect(pagePlatform({ reportedOS: "", legacyOS: "MacIntel" })["data-platform"]).toBe("mac");
  expect(pagePlatform({ reportedOS: "Windows", legacyOS: "MacIntel" })["data-platform"]).toBe("web");
});

it("falls back safely when storage or the OS report is unavailable", () => {
  expect(pagePlatform({ reportedOS: "macOS", storageBroken: true })["data-platform"]).toBe("mac");
  expect(pagePlatform({ storageBroken: true })).toEqual({ "data-platform": "web", "data-key-style": "ctrl" });
});

it("preserves the current page choice if the provider remounts with blocked storage", () => {
  expect(pagePlatform({ existingPlatform: "web", reportedOS: "macOS", storageBroken: true })["data-platform"]).toBe("web");
  expect(pagePlatform({ existingPlatform: "mac", reportedOS: "Windows", stored: "web" })).toEqual({
    "data-platform": "mac",
    "data-key-style": "mac",
  });
  expect(pagePlatform({ existingPlatform: "unknown", reportedOS: "macOS" })["data-platform"]).toBe("mac");
});

it("generates source-preserving hiding and selection rules for every launch platform", () => {
  for (const platform of PLATFORMS) {
    expect(platformStyles).toContain(`html[data-platform="${platform}"] [data-platform-content]:not([data-platform-content="${platform}"]) { display: none !important; }`);
    expect(platformStyles).toContain(`[data-platform-choice="${platform}"]`);
  }
  expect(platformStyles).toContain('html[data-key-style="mac"]');
  expect(platformStyles).toContain('html[data-key-style="ctrl"]');
});
