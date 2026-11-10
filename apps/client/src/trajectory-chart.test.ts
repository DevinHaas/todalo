import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { chartPoints, TrajectoryChart } from "./trajectory-chart";
import type { GoalStatusDto, SeasonGoalDto } from "./seasons";

const goal = (goalId: string, title: string): SeasonGoalDto => ({ id: `sg-${goalId}`, goalId, title, color: "teal", icon: "rocket", archived: false, tier: "primary", target: "x", carriedFromId: null, baseline: null });
const status = (patch: Partial<GoalStatusDto> = {}): GoalStatusDto => ({ band: "on_track", score: 0.8, weeks: [0.6, 0.8, 0.9], projection: 1, ...patch });
const render = (statuses: Record<string, GoalStatusDto>, day = 17) => renderToStaticMarkup(createElement(MemoryRouter, null,
  createElement(TrajectoryChart, { goals: [goal("v2", "Ship v2"), goal("fit", "Become fit")], statuses, day, length: 84 })));

describe("trajectory chart", () => {
  it("puts finished weeks at their end and today at the recent score, and projects from today to the end", () => {
    const { points, projection } = chartPoints(status(), 17, 84);
    const round = (list: { x: number; y: number }[]) => list.map(({ x, y }) => [Math.round(x * 84), Math.round(y * 100)]);
    // Week 3 has only started: today's point is the score (0.8), not its partial 0.9.
    expect(round(points)).toEqual([[7, 40], [14, 20], [17, 20]]);
    expect(round(projection)).toEqual([[17, 20], [84, 0]]);
    // Over: nothing left to project.
    expect(chartPoints(status({ weeks: [1] }), 84, 84).projection).toEqual([]);
  });

  it("draws one line and a dashed projection per goal with a status, with a text summary and legend buttons", () => {
    const html = render({ v2: status(), fit: status({ band: "off_track", score: 0.2, projection: 0.1 }) });
    expect(html.match(/data-chart-line=/g)).toHaveLength(2);
    expect(html.match(/data-chart-projection/g)).toHaveLength(2);
    expect(html).toContain("stroke-dasharray=\"5 5\"");
    expect(html).toContain("<title id=\"trajectory-title\">Goal trajectory across the season&#x27;s 12 weeks</title>");
    expect(html).toContain("Become fit: Off track, 20% now, 10% projected at the end");
    for (const band of ["On track", "Adjust", "Off track"]) expect(html).toContain(band);
    expect(html.match(/<button[^>]*data-season-chart-goal=/g)).toHaveLength(2);
    expect(html).toContain("aria-label=\"Ship v2: On track. Open goal\"");
  });

  it("leaves out goals without a status (archived) and renders nothing without any", () => {
    expect(render({ v2: status() }).match(/data-chart-line=/g)).toHaveLength(1);
    expect(render({})).toBe("");
  });
});
