import { describe, expect, it } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import type { TaskDto } from "./tasks";
import { GoalView, MilestoneToggle, type MilestoneSlots } from "./goal-views";
import { milestoneTaskIds, type GoalDetailDto, type GoalDto } from "./goals";
import { MilestoneTasks } from "./task-tree";
import { TaskRow } from "./views";
import { TaskEditor } from "./task-sheet";
import { seasonRange } from "./season-views";

const render = (node: ReactNode) => renderToStaticMarkup(createElement(MemoryRouter, null, node));
const goal = (extra: Partial<GoalDto> = {}): GoalDto => ({ id: "todalo", title: "Finish Todalo", description: null, color: "teal", archived: false, ...extra });
const task: TaskDto = {
  id: "beta", title: "Ship beta", description: null, status: "todo", priority: 4, projectId: null, sectionId: null, parentId: null,
  dueDate: null, dueDateEnd: null, deadline: null, completedAt: null, labelIds: [], recurrence: null, updatedAt: "2026-11-06T00:00:00.000Z",
};
const page = (detail: Partial<GoalDetailDto>, season: { tier: "primary" | "secondary"; target: string } | null = null) => render(createElement(GoalView, {
  state: { status: "success", error: null, data: { goal: goal(), projects: [], tasks: [], milestones: [], ...detail } }, season,
  onRetry: () => undefined, onSave: async () => undefined, onArchive: () => undefined, onUnlink: () => undefined, write: { pending: false, error: null },
}));
const slots = (extra: Partial<MilestoneSlots> = {}): MilestoneSlots => ({ goals: [goal()], milestone: null, onChange: () => undefined, error: null, ...extra });

describe("goal page", () => {
  // The user's report: a text typed as the season target showed under the goal on the
  // season page, but the goal page said "No description yet". The target lives on the
  // season, so the goal page must show it (labelled) and keep the description separate.
  it("shows the goal's season target, labelled, apart from its description", () => {
    const html = page({}, { tier: "primary", target: "A testable version for others" });
    expect(html).toContain('aria-label="This season"');
    expect(html).toContain("This season · Primary");
    expect(html).toContain('<span class="target-label">Target</span>A testable version for others');
    expect(html).toContain("Add a description");
  });

  it("shows the description itself, the colour as its icon, and no season card outside a season", () => {
    const html = page({ goal: goal({ description: "Why it matters" }) });
    expect(html).toContain('<p class="goal-description">Why it matters</p>');
    expect(html).not.toContain("Add a description");
    expect(html).not.toContain("This season");
    expect(html).toMatch(/class="goal-dot"[^>]*style="background:oklch\(0.65 0.11 190\)"/);
  });

  it("flags linked tasks that are milestones", () => {
    const html = page({ tasks: [task, { ...task, id: "plain", title: "Plain" }], milestones: [{ task, criteria: [], reached: false }] });
    expect(html.match(/class="milestone-mark"/g)).toHaveLength(2); // the milestone list and its task row
  });
});

describe("milestone in the task sheet", () => {
  it("explains that a milestone needs a goal link first", () => {
    const html = render(createElement(MilestoneToggle, { slots: slots({ goals: [] }) }));
    expect(html).toMatch(/role="switch"[^>]*disabled/);
    expect(html).toContain("Link this task to a goal first");
  });

  it("is a switch for the only linked goal", () => {
    expect(render(createElement(MilestoneToggle, { slots: slots() }))).toContain("Not a milestone");
    const on = render(createElement(MilestoneToggle, { slots: slots({ milestone: { goalId: "todalo", criteria: [] } }) }));
    expect(on).toMatch(/role="switch"[^>]*checked/);
    expect(on).toContain("for Finish Todalo");
  });

  it("lists done criteria in a collapsible section with visible, editable text and a count", () => {
    const milestone = slots({ milestone: { goalId: "todalo", criteria: [{ text: "Register", done: true }, { text: "Taper", done: false }] } });
    const html = render(createElement(TaskEditor, { task, onSave: async () => undefined, onClose: () => undefined, milestone }));
    expect(html).toContain('aria-label="Done criteria"');
    expect(html).toContain('aria-label="1 of 2 ticked"');
    expect(html).toMatch(/class="criterion-text"[^>]*value="Register"/);
    expect(html).toContain('aria-label="New done criterion"');
    // Not a milestone: no section.
    expect(render(createElement(TaskEditor, { task, onSave: async () => undefined, onClose: () => undefined, milestone: slots() }))).not.toContain("Done criteria");
  });
});

describe("milestone flags on rows", () => {
  it("come from goal links marked as milestones", () => {
    const ids = milestoneTaskIds({ projects: [], tasks: [{ goalId: "g", taskId: "beta", milestone: true }, { goalId: "g", taskId: "plain", milestone: false }] });
    expect([...ids]).toEqual(["beta"]);
    const row = (value: ReadonlySet<string>) => render(createElement(MilestoneTasks.Provider, { value }, createElement(TaskRow, { task, now: new Date() })));
    expect(row(ids)).toContain('class="milestone-mark"');
    expect(row(new Set())).not.toContain("milestone-mark");
  });
});

describe("season range", () => {
  it.each([
    [{ startDate: "2026-01-05", lengthDays: 84 }, "5 Jan – 29 Mar 2026"],
    [{ startDate: "2026-11-07", lengthDays: 84 }, "7 Nov 2026 – 29 Jan 2027"],
  ])("%o reads %s", (season, label) => expect(seasonRange(season)).toBe(label));
});
