import { expect, it } from "vitest";
import { cn } from "./utils";

it("knows the theme's own font sizes, so a text colour survives beside them", () => {
  expect(cn("text-[color:var(--color-primary-foreground)]", "text-xs-plus")).toBe("text-[color:var(--color-primary-foreground)] text-xs-plus");
  expect(cn("text-sm", "text-xs-plus")).toBe("text-xs-plus");
  expect(cn("text-2xs", "text-muted-foreground")).toBe("text-2xs text-muted-foreground");
});
