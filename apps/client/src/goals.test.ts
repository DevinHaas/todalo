import { describe, expect, it } from "vitest";
import { linkedGoalIds, toggleLink, type GoalLinksDto } from "./goals";

const links: GoalLinksDto = { projects: [{ goalId: "fit", projectId: "run" }], tasks: [{ goalId: "fit", taskId: "protein" }] };

describe("optimistic goal links", () => {
  it.each([
    ["links a task to a second goal", toggleLink(links, "muscle", "tasks", "protein", true), "tasks", "protein", ["fit", "muscle"]],
    ["linking twice keeps one link", toggleLink(links, "fit", "tasks", "protein", true), "tasks", "protein", ["fit"]],
    ["unlinks only that pair", toggleLink(links, "fit", "tasks", "protein", false), "tasks", "protein", []],
    ["links a project to a second goal", toggleLink(links, "muscle", "projects", "run", true), "projects", "run", ["fit", "muscle"]],
    ["unlinking a project leaves task links", toggleLink(links, "fit", "projects", "run", false), "tasks", "protein", ["fit"]],
  ] as const)("%s", (_name, next, kind, target, expected) => {
    expect(linkedGoalIds(next, kind, target)).toEqual(expected);
  });
});
