import { useNavigate } from "react-router";
import { goalColorValue } from "./goals";
import { bandLabels, statusRules, type GoalStatusDto, type SeasonGoalDto } from "./seasons";
import { GoalIcon } from "./goal-views";
import { Button, Hint } from "./ui";

// Goals ticket 16: one line per goal across the season's weeks over the three
// status bands, dashed from today to the season's end. Plain SVG (no chart
// library): the plot stretches to any width (viewBox 0..100 with
// non-scaling strokes), labels and dots are HTML so they never distort.

const pct = (value: number) => `${Math.round(value * 1000) / 10}%`;
const goalPath = (goalId: string) => `/goals/${encodeURIComponent(goalId)}`;
const percent = (score: number) => `${Math.round(score * 100)}%`;

/**
 * Finished weeks sit at their end; today's point is the recent score the band
 * is read from (a just-started week alone would plunge every line), and the
 * dashed projection runs from it to the season's end. Fractions of the season.
 */
export function chartPoints(status: GoalStatusDto, day: number, length: number) {
  const finished = Math.min(Math.floor(day / 7), status.weeks.length);
  const points = status.weeks.slice(0, finished).map((score, index) => ({ x: Math.min((index + 1) * 7, length) / length, y: 1 - score }));
  if (day > 0 && day % 7 !== 0 && day < length) points.push({ x: day / length, y: 1 - status.score });
  const last = points.at(-1);
  return { points, projection: last && day < length ? [last, { x: 1, y: 1 - status.projection }] : [] };
}

const bands = [
  { band: "on_track", top: 0, bottom: 1 - statusRules.onTrack, fill: "bg-success/10", text: "text-success" },
  { band: "adjust", top: 1 - statusRules.onTrack, bottom: 1 - statusRules.adjust, fill: "bg-attention/10", text: "text-attention" },
  { band: "off_track", top: 1 - statusRules.adjust, bottom: 1, fill: "bg-destructive/10", text: "text-destructive" },
] as const;

export function TrajectoryChart({ goals, statuses, day, length }: { goals: SeasonGoalDto[]; statuses: Record<string, GoalStatusDto>; day: number; length: number }) {
  const navigate = useNavigate();
  const lines = goals.flatMap(goal => statuses[goal.goalId] ? [{ goal, status: statuses[goal.goalId]!, ...chartPoints(statuses[goal.goalId]!, day, length) }] : []);
  if (!lines.length) return null;
  const weeks = Math.ceil(length / 7);
  const summary = lines.map(({ goal, status }) => `${goal.title}: ${bandLabels[status.band]}, ${percent(status.score)} now, ${percent(status.projection)} projected at the end`).join(". ");
  const open = (goalId: string) => navigate(goalPath(goalId));
  return <figure className="flex flex-col gap-3" aria-label="Trajectory">
    {day === 0 ? <Hint>Lines start when the season does.</Hint> : null}
    <div className="relative h-52 overflow-hidden rounded-lg border border-border">
      {bands.map(({ band, top, bottom, fill }) => <div key={band} aria-hidden="true" className={`absolute inset-x-0 ${fill}`} style={{ top: pct(top), height: pct(bottom - top) }} />)}
      <svg className="absolute inset-0 size-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-labelledby="trajectory-title trajectory-desc">
        <title id="trajectory-title">{`Goal trajectory across the season's ${weeks} weeks`}</title>
        <desc id="trajectory-desc">{`${summary}.`}</desc>
        {lines.map(({ goal, points, projection }) => {
          const path = (list: { x: number; y: number }[]) => list.map(({ x, y }, index) => `${index ? "L" : "M"}${x * 100} ${y * 100}`).join(" ");
          const color = goalColorValue(goal.color);
          return <g key={goal.goalId} className="cursor-pointer" onClick={() => open(goal.goalId)} data-chart-line={goal.goalId}>
            {points.length > 1 && <path d={path(points)} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
            {projection.length > 0 && <path d={path(projection)} fill="none" stroke={color} strokeWidth={2} strokeDasharray="5 5" strokeLinecap="round" vectorEffect="non-scaling-stroke" data-chart-projection="" />}
            {/* A wide invisible stroke so the thin line is easy to hit. */}
            <path d={path([...points, ...projection.slice(1)])} fill="none" stroke="transparent" strokeWidth={16} vectorEffect="non-scaling-stroke" pointerEvents="stroke" />
          </g>;
        })}
      </svg>
      {lines.flatMap(({ goal, points }) => points.map((point, index) => <span key={`${goal.goalId}-${index}`} aria-hidden="true"
        className="pointer-events-none absolute size-2 -translate-1/2 rounded-full ring-2 ring-background" style={{ left: pct(point.x), top: pct(point.y), background: goalColorValue(goal.color) }} />))}
      {day > 0 && day < length && <span aria-hidden="true" className="absolute inset-y-0 border-l border-dashed border-border-strong" style={{ left: pct(day / length) }} />}
      {/* Band names above the lines, on a backdrop so a line never hides them. */}
      {bands.map(({ band, top, text }) => <span key={band} aria-hidden="true" className={`pointer-events-none absolute left-1 mt-1 rounded-sm bg-background/80 px-1 text-2xs font-medium ${text}`}
        style={{ top: pct(top) }}>{bandLabels[band]}</span>)}
    </div>
    <div aria-hidden="true" className="relative -mt-2 h-4 text-2xs text-subtle-foreground tabular-nums">
      {Array.from({ length: weeks }, (_, index) => index + 1).filter(week => weeks <= 8 || week === 1 || week % 2 === 0).map(week =>
        <span key={week} className={week === weeks ? "absolute -translate-x-full" : "absolute -translate-x-1/2"} style={{ left: pct(Math.min(week * 7, length) / length) }}>W{week}</span>)}
    </div>
    <figcaption className="flex flex-wrap gap-1" aria-label="Goals in the chart">
      {lines.map(({ goal, status }) => <Button key={goal.goalId} variant="ghost" size="sm" className="font-normal" data-season-chart-goal={goal.goalId}
        aria-label={`${goal.title}: ${bandLabels[status.band]}. Open goal`} onClick={() => open(goal.goalId)}>
        <GoalIcon color={goal.color} icon={goal.icon} /><span className="max-w-40 truncate">{goal.title}</span>
      </Button>)}
    </figcaption>
  </figure>;
}
