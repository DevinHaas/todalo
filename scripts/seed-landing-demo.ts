// Calm demo content for the landing-page screen captures (docs/landing, section 2.3).
// Wipes and refills ONLY the demo account. One state per feature clip:
//   bun --env-file=.env scripts/seed-landing-demo.ts <fresh|day1|assign|midseason>
//   fresh     no season, no goals
//   setup     as fresh with a connected Coach: "Set up your season" (the clip stubs the Coach's suggestions)
//   day1      season started today, no goals yet
//   assign    day 1, five goals all Primary: "Assign goals" picks what makes the cut
//   midseason day 36, four reviewed weeks, Weekly review due: "Review"
//   coach     midseason plus a connected Coach and the draft its chat reply makes: "Plan with the Coach"
// Create the account first: TEST_USER_EMAIL=demo@todalo.dev TEST_USER_NAME="Alex Morgan" bun run seed:test-user
import { db } from "@todalo/db";
import { coachDraftItems, coachDrafts, coachProviders, goalProjects, goalTasks, goals, labels, progressRatings, projects, ritualRuns, ritualSettings, seasonGoals, seasons, tasks, user, userSettings } from "@todalo/db/schema";
import { and, eq } from "drizzle-orm";

const state = process.argv[2] ?? "midseason";
if (!["fresh", "setup", "day1", "assign", "midseason", "coach"].includes(state)) throw new Error(`Unknown state ${state}`);
const email = process.env.DEMO_USER_EMAIL ?? "demo@todalo.dev";
// ponytail: dates are fixed to the capture day (Mon 9 Nov 2026, CET +01:00); move TODAY to re-shoot later.
const TODAY = process.env.DEMO_TODAY ?? "2026-11-09";
const day = (offset: number) => { const d = new Date(`${TODAY}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); };
const at = (offset: number, time: string) => new Date(`${day(offset)}T${time}:00+01:00`);

const [demo] = await db.select().from(user).where(eq(user.email, email)).limit(1);
if (!demo) throw new Error(`No user ${email}. Create it with seed:test-user first.`);
const userId = demo.id;

for (const table of [coachDrafts, coachProviders, ritualRuns, seasons, tasks, goals, projects, labels]) await db.delete(table).where(eq(table.userId, userId));
await db.delete(ritualSettings).where(eq(ritualSettings.userId, userId));
// No Todoist-import prompt over the captures.
await db.insert(userSettings).values({ userId, importPromptSeenAt: new Date() }).onConflictDoUpdate({ target: userSettings.userId, set: { importPromptSeenAt: new Date(), goalsHidden: false } });

const project = async (name: string, color: string) => (await db.insert(projects).values({ userId, name, color }).returning())[0].id;
const P = { health: await project("Health", "#5b8c6a"), writing: await project("Writing", "#6b7280"), home: await project("Home", "#b08968"), studio: await project("Studio", "#4a6fa5") };

type T = { goal?: string; title: string; projectId?: string | null; start?: Date | null; end?: Date | null; done?: boolean; horizon?: "now" | "next" | "later"; priority?: number };
const addTasks = (rows: T[]) => rows.length ? db.insert(tasks).values(rows.map((row, i) => ({
  userId, title: row.title, projectId: row.projectId ?? null, dueDate: row.start ?? null, dueDateEnd: row.end ?? null, horizon: row.horizon ?? null, priority: row.priority ?? 4,
  status: row.done ? "done" as const : "todo" as const, completedAt: row.done ? (row.end ?? row.start ?? new Date()) : null, sortOrder: i,
}))) : undefined;

// This week, the same in every state: a few blocks and errands.
await addTasks([
  { title: "Easy run · 5 km", projectId: P.health, start: at(0, "07:00"), end: at(0, "07:45"), done: true },
  { title: "Deep work · onboarding flows", projectId: P.studio, start: at(0, "09:00"), end: at(0, "11:00") },
  { title: "Intervals · 6 × 400 m", projectId: P.health, start: at(1, "07:00"), end: at(1, "07:45") },
  { title: "Write · essay four", projectId: P.writing, start: at(1, "09:00"), end: at(1, "10:30") },
  { title: "Design review", projectId: P.studio, start: at(1, "14:00"), end: at(1, "15:00") },
  { title: "Easy run · 6 km", projectId: P.health, start: at(2, "07:00"), end: at(2, "07:45") },
  { title: "Deep work · empty states", projectId: P.studio, start: at(2, "13:00"), end: at(2, "15:00") },
  { title: "Write · essay four", projectId: P.writing, start: at(3, "08:30"), end: at(3, "10:00") },
  { title: "Sand the hallway walls", projectId: P.home, start: at(3, "17:30"), end: at(3, "19:00") },
  { title: "Deep work · checklist copy", projectId: P.studio, start: at(3, "13:00"), end: at(3, "14:30") },
  { title: "Easy run · 5 km", projectId: P.health, start: at(4, "07:00"), end: at(4, "07:45") },
  { title: "Weekly review", start: at(4, "16:00"), end: at(4, "16:45") },
  { title: "Hallway · first coat", projectId: P.home, start: at(5, "10:00"), end: at(5, "12:00") },
  { title: "Long run · 14 km", projectId: P.health, start: at(6, "09:00"), end: at(6, "10:30") },
  { title: "Order paint samples", projectId: P.home, start: at(1, "00:00") },
  { title: "Return library books", start: at(2, "00:00") },
  // Unscheduled work the Plan sidebar offers for the calendar.
  { title: "Outline essay five", projectId: P.writing, horizon: "now" },
  { title: "Tempo run · 8 km", projectId: P.health, horizon: "now" },
  { title: "Finish chapter 4 of Piranesi", projectId: P.writing, horizon: "now" },
  { title: "Prototype the welcome checklist", projectId: P.studio, horizon: "now" },
  { title: "Pick the hallway colour", projectId: P.home, horizon: "next" },
]);

if (state === "fresh") done();
// A local Ollama provider: no key, never called (the clips stub the Coach's answers).
const connectCoach = () => db.insert(coachProviders).values({ userId, provider: "ollama", model: "llama3.2", baseUrl: "http://localhost:11434" });
if (state === "setup") { await connectCoach(); done(); }

const seasonStart = state === "midseason" || state === "coach" ? day(-35) : TODAY;
const [season] = await db.insert(seasons).values({ userId, startDate: seasonStart, lengthDays: 84 }).returning();
if (state === "day1") done();

const goalRows = [
  { key: "run", title: "Run a half marathon", color: "green", icon: "footprints", projectId: P.health, tier: "primary", target: "21 km under 2 hours in March" },
  { key: "essays", title: "Finish the essay collection", color: "violet", icon: "pen-tool", projectId: P.writing, tier: "primary", target: "First draft of all ten essays" },
  { key: "ship", title: "Ship the onboarding redesign", color: "blue", icon: "rocket", projectId: P.studio, tier: "primary", target: "New onboarding live for every sign-up" },
  { key: "read", title: "Read 6 books", color: "orange", icon: "book-open", projectId: null, tier: "secondary", target: "Six books, one every two weeks" },
  { key: "hall", title: "Repaint the hallway", color: "amber", icon: "home", projectId: P.home, tier: "secondary", target: "Hallway painted before the holidays" },
] as const;
const G: Record<string, string> = {};
for (const [i, g] of goalRows.entries()) {
  const [row] = await db.insert(goals).values({ userId, title: g.title, color: g.color, icon: g.icon, sortOrder: i }).returning();
  G[g.key] = row.id;
  if (g.projectId) await db.insert(goalProjects).values({ userId, goalId: row.id, projectId: g.projectId });
  // "assign" starts with everything Primary, so the clip can pick what makes the cut.
  await db.insert(seasonGoals).values({ userId, seasonId: season.id, goalId: row.id, tier: state === "assign" ? "primary" : g.tier, target: g.target });
}
if (state === "assign") done();

// midseason: four reviewed weeks (Oct 5 – Nov 1) plus last week waiting for its review.
await db.insert(ritualSettings).values({ userId, weeklyReviewEnabled: true, weeklyReviewDay: 1, weeklyReviewTime: "08:00", seasonReviewEnabled: true, notify: false });
type Week = { run: [number, string]; essays: [number, string]; ship: [number, string]; read: [number, string]; hall: [number, string] };
// [goal-linked tasks completed, weekly rating]
const weeks: Week[] = [
  { run: [3, "solid"], essays: [1, "mixed"], ship: [3, "solid"], read: [1, "solid"], hall: [1, "mixed"] },
  { run: [3, "solid"], essays: [2, "mixed"], ship: [3, "solid"], read: [1, "solid"], hall: [1, "mixed"] },
  { run: [3, "massive"], essays: [2, "solid"], ship: [2, "solid"], read: [1, "mixed"], hall: [2, "solid"] },
  { run: [3, "solid"], essays: [3, "solid"], ship: [3, "massive"], read: [2, "solid"], hall: [2, "solid"] },
  { run: [3, "solid"], essays: [3, "massive"], ship: [3, "solid"], read: [1, "solid"], hall: [2, "solid"] },
];
const work: Record<keyof Week, [string, string | null, string]> = {
  run: ["Run", P.health, "07:00"], essays: ["Write", P.writing, "09:00"], ship: ["Deep work", P.studio, "13:00"], read: ["Read", null, "21:00"], hall: ["Hallway", P.home, "17:30"],
};
const history: T[] = [];
weeks.forEach((week, w) => {
  for (const key of Object.keys(work) as (keyof Week)[]) {
    const [label, projectId, time] = work[key];
    for (let n = 0; n < week[key][0]; n++) {
      const start = at(-35 + w * 7 + n * 2, time), end = new Date(start.getTime() + 60 * 60_000);
      history.push({ title: `${label} · session ${n + 1}`, projectId: key === "read" ? null : projectId, start, end, done: true, goal: key === "read" ? G.read : undefined });
    }
  }
});
const inserted = await addTasks(history)?.returning({ id: tasks.id, title: tasks.title });
// Reading has no project, so its sessions link to the goal directly.
const reading = history.map((row, i) => ({ row, id: inserted![i].id })).filter(item => item.row.goal);
if (reading.length) await db.insert(goalTasks).values(reading.map(({ row, id }) => ({ userId, goalId: row.goal!, taskId: id })));
for (const [w, week] of weeks.slice(0, 4).entries()) {
  const [run] = await db.insert(ritualRuns).values({ userId, kind: "weekly_review", period: day(-35 + w * 7), status: "completed" }).returning();
  await db.insert(progressRatings).values((Object.keys(work) as (keyof Week)[]).map(key => ({ userId, runId: run.id, goalId: G[key], rating: week[key][1] as "solid" })));
}
if (state === "midseason") done();

// coach: a local Ollama provider (no key, never called: the clip stubs the chat request) and
// the draft the Coach bar's reply makes, as drafts.ts would save it.
await connectCoach();
const task = async (title: string) => (await db.select().from(tasks).where(and(eq(tasks.userId, userId), eq(tasks.title, title))).limit(1))[0];
const [draft] = await db.insert(coachDrafts).values({ userId, kind: "chat", period: TODAY,
  summary: "Your sharpest mornings go to the essays and the onboarding work, and the tempo run fits before the hallway on Saturday." }).returning();
// Thursday to Sunday, so the clip's crop holds the four days and the Coach panel.
const items: { op: "move"; title: string; start: Date; end: Date; goal: string; reason: string }[] = [
  { op: "move", title: "Outline essay five", start: at(3, "10:30"), end: at(3, "12:00"), goal: "essays", reason: "Keeps Thursday's writing morning going." },
  { op: "move", title: "Prototype the welcome checklist", start: at(4, "09:00"), end: at(4, "11:00"), goal: "ship", reason: "Two clear hours for a primary goal." },
  { op: "move", title: "Tempo run · 8 km", start: at(5, "08:00"), end: at(5, "08:50"), goal: "run", reason: "A third run keeps March on track." },
  { op: "move", title: "Finish chapter 4 of Piranesi", start: at(6, "11:00"), end: at(6, "11:45"), goal: "read", reason: "A chapter after the long run." },
];
for (const [position, item] of items.entries()) {
  const row = await task(item.title);
  await db.insert(coachDraftItems).values({ userId, draftId: draft.id, position, op: item.op, taskId: row.id, title: item.title, startAt: item.start, endAt: item.end,
    goalId: G[item.goal], reason: item.reason, seenUpdatedAt: row.updatedAt });
}
done();

function done(): never {
  console.log(`Demo state "${state}" ready for ${email}`);
  process.exit(0);
}
