const ACCOUNT = Object.freeze({
  email: "help-screenshots@todalo.invalid",
  password: "docs-fixture-only-2026",
  name: "Alex Morgan",
});

const PROJECTS = [
  { name: "Health", color: "#22c55e", favorite: false },
  { name: "Writing", color: "#8b5cf6", favorite: false },
  { name: "Home", color: "#f97316", favorite: false },
];

const GOALS = [
  { title: "Run a half marathon", color: "green", icon: "footprints" },
  { title: "Finish an essay collection", color: "violet", icon: "pen-tool" },
  { title: "Make room for a home studio", color: "orange", icon: "home" },
];

const TASKS = [
  { id: "b68ba39e-345d-4cdf-ae06-000000000001", title: "Return library books", priority: 4 },
  { id: "b68ba39e-345d-4cdf-ae06-000000000002", title: "Order paint samples", priority: 3 },
  { id: "b68ba39e-345d-4cdf-ae06-000000000003", title: "Book a bike service", priority: 4 },
  { id: "b68ba39e-345d-4cdf-ae06-000000000004", title: "Pick a recipe for Sunday lunch", priority: 4 },
  { id: "b68ba39e-345d-4cdf-ae06-000000000005", title: "Plan a riverside running route", priority: 3, project: "Health" },
  { id: "b68ba39e-345d-4cdf-ae06-000000000006", title: "Outline the opening essay", priority: 2, project: "Writing" },
  { id: "b68ba39e-345d-4cdf-ae06-000000000007", title: "Measure the studio shelves", priority: 4, project: "Home" },
];

function localOrigin(value) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)
    || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Use a loopback client origin only, for example http://localhost:5173.");
  }
  return url.origin;
}

function assertAccount(account) {
  if (account?.user?.email !== ACCOUNT.email || account.user.name !== ACCOUNT.name || account.user.image) {
    throw new Error("Refusing a non-fixture account or a changed fixture profile.");
  }
}

function assertCollection(records, fixtures, key, matches, allowMissing) {
  if (!Array.isArray(records)) throw new Error("Unexpected API response; no captures were published.");
  const seen = new Set();
  for (const record of records) {
    const fixture = fixtures.find(candidate => candidate[key] === record[key]);
    if (!fixture || seen.has(record[key]) || !matches(record, fixture)) {
      throw new Error("Fixture data has changed or contains unknown records. Use a clean demo database; nothing was reset.");
    }
    seen.add(record[key]);
  }
  if (!allowMissing && seen.size !== fixtures.length) {
    throw new Error("Demo fixtures are missing. Run with --seed against an isolated local development API.");
  }
}

function assertFixtures(snapshot, { allowMissing = false } = {}) {
  assertAccount(snapshot.account);
  assertCollection(snapshot.projects, PROJECTS, "name", (project, fixture) =>
    project.color === fixture.color && project.description === null && !project.archived && !project.favorite, allowMissing);
  assertCollection(snapshot.goals, GOALS, "title", (goal, fixture) =>
    goal.color === fixture.color && goal.icon === fixture.icon && goal.description === null && !goal.archived, allowMissing);
  const projectIds = new Map(snapshot.projects.map(project => [project.name, project.id]));
  assertCollection(snapshot.tasks, TASKS, "id", (task, fixture) =>
    task.title === fixture.title && task.description === null && task.priority === fixture.priority
    && task.status === "todo" && task.projectId === (projectIds.get(fixture.project) ?? null)
    && task.sectionId === null && task.parentId === null && task.dueDate === null
    && task.dueDateEnd === null && task.deadline === null && task.recurrence === null
    && !task.horizon && !task.commentCount && Array.isArray(task.labelIds) && task.labelIds.length === 0, allowMissing);
  if (!Array.isArray(snapshot.metadata?.labels) || snapshot.metadata.labels.length
    || !Array.isArray(snapshot.metadata?.filters) || snapshot.metadata.filters.length) {
    throw new Error("Refusing unexpected labels or filters in the screenshot account.");
  }
}

async function readSnapshot(api) {
  const [account, projects, goals, today, metadata] = await Promise.all([
    api("GET", "/api/v1/account"),
    api("GET", "/api/v1/projects"),
    api("GET", "/api/v1/goals"),
    api("GET", "/api/v1/today"),
    api("GET", "/api/v1/metadata"),
  ]);
  return { account, projects: projects.projects, goals: goals.goals, tasks: today.tasks, metadata };
}

async function seedDemo(api) {
  const snapshot = await readSnapshot(api);
  assertFixtures(snapshot, { allowMissing: true });
  for (const fixture of PROJECTS) {
    if (!snapshot.projects.some(project => project.name === fixture.name)) {
      const { project } = await api("POST", "/api/v1/projects", fixture);
      snapshot.projects.push(project);
    }
  }
  for (const fixture of GOALS) {
    if (!snapshot.goals.some(goal => goal.title === fixture.title)) {
      const { goal } = await api("POST", "/api/v1/goals", fixture);
      snapshot.goals.push(goal);
    }
  }
  for (const { project, ...fixture } of TASKS) {
    if (!snapshot.tasks.some(task => task.id === fixture.id)) {
      await api("POST", "/api/v1/tasks", {
        ...fixture,
        projectId: snapshot.projects.find(candidate => candidate.name === project)?.id ?? null,
        placement: { edge: "bottom" },
      });
    }
  }
  await api("POST", "/api/v1/imports/todoist/prompt");
  assertFixtures(await readSnapshot(api));
}

module.exports = { ACCOUNT, PROJECTS, GOALS, TASKS, localOrigin, assertAccount, assertFixtures, readSnapshot, seedDemo };
