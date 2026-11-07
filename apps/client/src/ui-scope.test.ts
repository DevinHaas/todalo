import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ContextMenu, ContextMenuTrigger } from "./ui";

// The scoped preflight resets everything inside `[data-slot]` (ui/styles.css),
// so a library wrapper around legacy markup must not carry it.
describe("library wrappers around legacy markup", () => {
  it("keeps a task row wrapped in the context-menu trigger out of the reset scope", () => {
    const row = createElement("div", { className: "task-row" }, createElement("button", { className: "checkbox" }));
    const html = renderToStaticMarkup(createElement(ContextMenu, null, createElement(ContextMenuTrigger, { className: "contents" }, row)));
    expect(html).toContain('class="task-row"');
    expect(html).not.toContain("data-slot");
  });
});
