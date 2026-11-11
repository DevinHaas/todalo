import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const native = vi.hoisted(() => ({ tauri: false, calls: [] as unknown[][] }));
vi.mock("@tauri-apps/api/core", async (original) => ({
  ...await original<typeof import("@tauri-apps/api/core")>(),
  isTauri: () => native.tauri,
  invoke: async (...args: unknown[]) => { native.calls.push(args); },
}));

import { helpLink } from "./help";
import links from "./help-links.json";
import { CalendarSettings } from "./calendar-views";

const click = () => ({ preventDefault: vi.fn() });

describe("help center links", () => {
  beforeEach(() => { native.tauri = false; native.calls.length = 0; });

  it("points at the help center home", () => {
    expect(helpLink().href).toBe("https://help.todalo.app");
  });

  it("links the published Google Calendar article", () => {
    expect(helpLink("google-calendar").href).toBe("https://help.todalo.app/integrations/use-google-calendar-with-todalo");
    expect(links.unpublished).toEqual({});
  });

  it("is a plain new-tab link in the browser", () => {
    const link = helpLink();
    const event = click();
    link.onClick(event);
    expect(link).toMatchObject({ target: "_blank", rel: "noreferrer" });
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(native.calls).toEqual([]);
  });

  it("asks the Mac app to open the system browser, naming the article and never a URL", () => {
    native.tauri = true;
    const home = click();
    helpLink().onClick(home);
    expect(home.preventDefault).toHaveBeenCalled();
    expect(native.calls).toEqual([["open_help", { article: null }]]);
  });
});

describe("calendar settings", () => {
  it("links the multiple-accounts hint to the Google Calendar article", () => {
    const html = renderToStaticMarkup(createElement(CalendarSettings, {
      state: { status: "success", error: null, data: [] }, onRetry: () => undefined,
      actions: {} as never, pending: new Set<string>(), error: null, link: null,
    } as never));
    expect(html).toContain('href="https://help.todalo.app/integrations/use-google-calendar-with-todalo"');
    expect(html).toContain("show events from multiple accounts");
  });
});

describe("native open_help command", () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
  // A Tauri command the webview may call is listed in all three places.
  it("is registered, built and allowed", () => {
    expect(read("../src-tauri/build.rs")).toContain('"open_help"');
    expect(read("../src-tauri/src/lib.rs")).toContain("help::open_help");
    expect(read("../src-tauri/capabilities/default.json")).toContain('"allow-open-help"');
  });
});
