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
});
