import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const config = JSON.parse(readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"));
const directive = (name: string) =>
  (config.app.security.csp as string).split(";").map((part) => part.trim().split(/\s+/)).find(([key]) => key === name)?.slice(1) ?? [];

describe("native webview CSP", () => {
  // Ramble loads its AudioWorklet from a blob: URL; WKWebView rejected it with
  // "SecurityError: Not allowed by CSP", which surfaced as a microphone denial.
  it("lets the Ramble audio worklet load from a blob: module", () => {
    expect(directive("script-src")).toEqual(["'self'", "blob:"]);
  });

  // The pre-paint theme script is a same-origin file: an inline script would need 'unsafe-inline'.
  it("loads the pre-paint theme script from the app origin, before the app", () => {
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    expect(html).toMatch(/<head>[\s\S]*<script src="\/theme\.js"><\/script>[\s\S]*<\/head>/);
    expect(html.match(/<script>/g)).toBeNull();
  });
});

describe("pre-paint theme script", () => {
  const source = readFileSync(new URL("../public/theme.js", import.meta.url), "utf8");
  const run = (saved: string | null, failing = false) => {
    const classes = new Set<string>(["dark"]);
    const classList = { toggle: (name: string, on: boolean) => { if (on) classes.add(name); else classes.delete(name); } };
    const storage = { getItem: (key: string) => { if (failing) throw new Error("blocked"); return key === "todalo-theme" ? saved : null; } };
    new Function("document", "localStorage", source)({ documentElement: { classList } }, storage);
    return classes.has("dark");
  };
  it("uses theme.ts semantics: only a saved \"dark\" is dark", () => {
    expect(run("dark")).toBe(true);
    expect(run("light")).toBe(false);
    expect(run(null)).toBe(false);
    expect(run(null, true)).toBe(true); // unreadable storage leaves the page as it is
  });
});
