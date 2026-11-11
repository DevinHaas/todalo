// The visitor's platform choice. One global choice, remembered in the browser,
// decides which platform-specific blocks and which modifier keys are shown.
// No imports: tests load this file under the root Vitest config.

export const PLATFORMS = ["web", "mac"] as const;
export type Platform = (typeof PLATFORMS)[number];
/** Every platform an article can be available on; only Web and Mac are switchable. */
export const PLATFORM_LABELS = { web: "Web", mac: "Mac", ios: "iOS" } as const;
export const PLATFORM_KEY = "todalo-help-platform";

/** What the browser reports as its operating system ("macOS", "MacIntel", "Win32"). */
export function isMacOS(reportedOs: string): boolean {
  // ponytail: an iPad in desktop mode reports "MacIntel" and counts as a Mac.
  // Tell them apart by touch points if iPad visitors ever matter.
  return /^mac/i.test(reportedOs);
}

/** First visit: Mac when the browser reports macOS, otherwise Web. */
export function defaultPlatform(reportedOs: string): Platform {
  return isMacOS(reportedOs) ? "mac" : "web";
}

export function isPlatform(value: unknown): value is Platform {
  return (PLATFORMS as readonly unknown[]).includes(value);
}

/** A stored choice wins; anything else falls back to the default for the system. */
export function resolvePlatform(stored: string | null, reportedOs: string): Platform {
  return isPlatform(stored) ? stored : defaultPlatform(reportedOs);
}

export type KeyStyle = "mac" | "ctrl";

/** Ctrl-style keys only for Web on a system that is not macOS; Mac keys everywhere else. */
export function keyStyle(platform: Platform, reportedOs: string): KeyStyle {
  return platform === "web" && !isMacOS(reportedOs) ? "ctrl" : "mac";
}

// Modifier names an author may write in a shortcut, and how each style shows them.
// "Mod" is the main modifier: Command on a Mac, Ctrl elsewhere.
const MODIFIERS: Record<string, Record<KeyStyle, string>> = {
  mod: { mac: "⌘", ctrl: "Ctrl" },
  ctrl: { mac: "⌃", ctrl: "Ctrl" },
  alt: { mac: "⌥", ctrl: "Alt" },
  shift: { mac: "⇧", ctrl: "Shift" },
};
// Apple writes ⌃⌥⇧⌘; Windows and Linux write Ctrl+Alt+Shift.
const MODIFIER_ORDER: Record<KeyStyle, string[]> = {
  mac: ["ctrl", "alt", "shift", "mod"],
  ctrl: ["mod", "ctrl", "alt", "shift"],
};

/**
 * A shortcut as the visitor reads it: keyLabel("Mod+Shift+C", "mac") is "⇧⌘C",
 * and "Ctrl+Shift+C" in the Ctrl style. Keys other than modifiers are shown as written.
 */
export function keyLabel(keys: string, style: KeyStyle): string {
  // Split on "+", except a final one: "Mod++" is Mod and the plus key.
  const tokens = keys.split(/\+(?!$)/).map((token) => token.trim());
  const held = new Set(tokens.map((token) => token.toLowerCase()));
  const modifiers = MODIFIER_ORDER[style].filter((name) => held.has(name)).map((name) => MODIFIERS[name][style]);
  const rest = tokens.filter((token) => !Object.hasOwn(MODIFIERS, token.toLowerCase()));
  return [...new Set(modifiers), ...rest].join(style === "mac" ? "" : "+");
}

export function needsPlatformSwitcher(source: string): boolean {
  let fence: string | undefined;
  const prose = source
    .replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "")
    .replace(/<!--[\s\S]*?-->|\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .split(/\r?\n/)
    .map((line) => {
      const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
      if (fence) {
        if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) {
          fence = undefined;
        }
        return "";
      }
      if (marker) {
        fence = marker[1];
        return "";
      }
      return line;
    })
    .join("\n")
    .replace(/(`+)[\s\S]*?\1/g, "");
  return /<(?:Platform|PlatformContent)(?=[\s/>])/.test(prose);
}

export const platformScript = `(function () {
  var root = document.documentElement;
  var platforms = ${JSON.stringify(PLATFORMS)};
  var os = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || "";
  var mac = /^mac/i.test(os);
  var stored = null;
  try { stored = localStorage.getItem("${PLATFORM_KEY}"); } catch (error) {}
  var current = root.getAttribute("data-platform");
  var platform = platforms.indexOf(current) !== -1 ? current : platforms.indexOf(stored) !== -1 ? stored : mac ? "mac" : "web";
  root.setAttribute("data-platform", platform);
  root.setAttribute("data-key-style", platform === "web" && !mac ? "ctrl" : "mac");
})();`;

export const platformStyles = [
  'html:not([data-platform]) [data-platform-content]:not([data-platform-content="web"]) { display: none !important; }',
  'html:not([data-key-style]) [data-key-style-content="mac"] { display: none !important; }',
  ...PLATFORMS.flatMap((platform) => [
    `html[data-platform="${platform}"] [data-platform-content]:not([data-platform-content="${platform}"]) { display: none !important; }`,
    `html[data-platform="${platform}"] [data-platform-choice="${platform}"] { background: var(--ink); color: var(--paper); border-color: var(--ink); }`,
  ]),
  ...(["mac", "ctrl"] as const).map(
    (style) => `html[data-key-style="${style}"] [data-key-style-content]:not([data-key-style-content="${style}"]) { display: none !important; }`,
  ),
].join("\n");
