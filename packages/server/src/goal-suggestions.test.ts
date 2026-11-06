import { describe, expect, it } from "vitest";
import { suggestGoals, type SuggestionTask } from "./goal-suggestions";

const t = (id: string, projectId: string | null, labelIds: string[] = []): SuggestionTask => ({ id, projectId, labelIds });
const tasks = [
  t("run-1", "run", ["health"]), t("run-2", "run"), t("run-3", "run"),
  t("inbox-health", null, ["health"]), t("meals-1", "meals"), t("inbox-plain", null),
];
const link = (goalId: string, taskId: string) => ({ goalId, taskId });
const project = (goalId: string, projectId: string) => ({ goalId, projectId });
const goalIds = ["fit", "v2", "read"];

describe("suggestGoals", () => {
  it.each([
    { name: "same-project links, ranked by frequency", task: t("new", "run"), links: [link("v2", "run-1"), link("fit", "run-2"), link("fit", "run-3")], expected: ["fit", "v2"] },
    { name: "ties keep the user's goal order", task: t("new", "run"), links: [link("v2", "run-1"), link("fit", "run-2")], expected: ["fit", "v2"] },
    { name: "same-label links from other projects and the Inbox", task: t("new", "meals", ["health"]), links: [link("read", "inbox-health"), link("read", "run-1")], expected: ["read"] },
    { name: "a task matching by project and label counts once", task: t("new", "run", ["health"]), links: [link("v2", "run-1"), link("fit", "run-2"), link("fit", "run-3")], expected: ["fit", "v2"] },
    { name: "Inbox tasks without labels relate to nothing", task: t("new", null), links: [link("fit", "inbox-plain"), link("fit", "inbox-health")], expected: [] },
    { name: "unrelated tasks' links are ignored", task: t("new", "run"), links: [link("read", "meals-1")], expected: [] },
    { name: "the task's own link to an active goal stops suggestions", task: t("run-3", "run"), links: [link("fit", "run-2"), link("v2", "run-3")], expected: [] },
    { name: "archived goals are never suggested and do not count as linked", task: t("run-3", "run"), links: [link("old", "run-3"), link("old", "run-1"), link("fit", "run-2")], expected: ["fit"] },
    { name: "the task's project link counts as two sibling links", task: t("new", "run"), links: [link("fit", "run-1")], projects: [project("v2", "run")], expected: ["v2", "fit"] },
    { name: "a project link ties two sibling links (goal order breaks it)", task: t("new", "run"), links: [link("v2", "run-1"), link("v2", "run-2")], projects: [project("fit", "run")], expected: ["fit", "v2"] },
    { name: "the project link adds to sibling links", task: t("new", "run"), links: [link("fit", "run-1"), link("v2", "run-1"), link("v2", "run-2"), link("v2", "run-3")], projects: [project("fit", "run")], expected: ["fit", "v2"] },
    { name: "other projects' links are ignored", task: t("new", "run"), projects: [project("fit", "meals")], expected: [] },
    { name: "Inbox tasks get no project-link suggestions", task: t("new", null), projects: [project("fit", "run")], expected: [] },
    { name: "a dismissed or archived project-linked goal is skipped", task: t("new", "run"), projects: [project("fit", "run"), project("old", "run")], dismissed: ["fit"], expected: [] },
    { name: "the task's own goal stops project-link suggestions", task: t("run-1", "run"), links: [link("v2", "run-1")], projects: [project("fit", "run")], expected: [] },
    { name: "dismissed goals are skipped", task: t("new", "run"), links: [link("fit", "run-1"), link("v2", "run-2")], dismissed: ["fit"], expected: ["v2"] },
  ] as { name: string; task: SuggestionTask; links?: { goalId: string; taskId: string }[]; projects?: { goalId: string; projectId: string }[]; dismissed?: string[]; expected: string[] }[])("$name", ({ task, links = [], projects = [], dismissed = [], expected }) => {
    expect(suggestGoals({ task, tasks, taskLinks: links, projectLinks: projects, goalIds, dismissed })).toEqual(expected);
  });
});
