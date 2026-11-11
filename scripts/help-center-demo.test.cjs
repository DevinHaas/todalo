const { test } = require("node:test");
const assert = require("node:assert/strict");
const { ACCOUNT, PROJECTS, GOALS, TASKS, localOrigin, assertFixtures, seedDemo } = require("./help-center-demo.cjs");
const { options, apiClient, authenticate } = require("./docs-capture.cjs");

function snapshot() {
  const projects = PROJECTS.map((fixture, index) => ({ ...fixture, id: `project-${index}`, description: null, archived: false }));
  return {
    account: { user: { ...ACCOUNT, image: null } },
    projects,
    goals: GOALS.map((fixture, index) => ({ ...fixture, id: `goal-${index}`, description: null, archived: false })),
    tasks: TASKS.map(({ project, ...fixture }) => ({
      ...fixture, projectId: projects.find(candidate => candidate.name === project)?.id ?? null,
      description: null, status: "todo", sectionId: null, parentId: null, dueDate: null, dueDateEnd: null,
      deadline: null, recurrence: null, labelIds: [], horizon: null, commentCount: 0,
    })),
    metadata: { labels: [], filters: [] },
  };
}

function fakeApi(state) {
  const writes = [];
  const api = async (method, route, data) => {
    if (method === "GET") {
      const responses = {
        "/api/v1/account": state.account,
        "/api/v1/projects": { projects: structuredClone(state.projects) },
        "/api/v1/goals": { goals: structuredClone(state.goals) },
        "/api/v1/today": { tasks: structuredClone(state.tasks) },
        "/api/v1/metadata": state.metadata,
      };
      assert.ok(route in responses, `Unexpected read: ${route}`);
      return responses[route];
    }
    assert.equal(method, "POST");
    writes.push({ route, data });
    if (route === "/api/v1/projects") {
      const project = { ...data, id: `project-${state.projects.length}`, description: null, archived: false };
      state.projects.push(project);
      return { project };
    }
    if (route === "/api/v1/goals") {
      const goal = { ...data, id: `goal-${state.goals.length}`, description: null, archived: false };
      state.goals.push(goal);
      return { goal };
    }
    if (route === "/api/v1/tasks") {
      const task = { ...snapshot().tasks.find(task => task.id === data.id), ...data };
      state.tasks.push(task);
      return { task };
    }
    assert.equal(route, "/api/v1/imports/todoist/prompt");
    return { prompt: false };
  };
  return { api, writes };
}

test("only loopback origins are accepted, not remote hosts or credentials", () => {
  for (const origin of ["http://localhost:5173", "http://127.0.0.1:5174", "http://[::1]:5173"]) {
    assert.equal(localOrigin(origin), origin);
  }
  for (const origin of ["https://todalo.app", "http://localhost.evil.test", "file:///tmp/client", "http://user:password@localhost", "http://localhost/inbox", "http://localhost?api=remote", "http://localhost#remote"]) {
    assert.throws(() => localOrigin(origin));
  }
});

test("capture defaults are read-only and shot names cannot traverse the output directory", () => {
  assert.equal(options([]).seed, false);
  assert.equal(options(["--seed-only"]).seed, true);
  assert.deepEqual(options(["quick-add"]).names, ["quick-add"]);
  assert.throws(() => options(["../../secret"]));
  assert.throws(() => options(["--base-url"]));
  assert.throws(() => options(["--reset"]));
});

test("fixture validation accepts complete synthetic data, not incomplete captures", () => {
  assert.doesNotThrow(() => assertFixtures(snapshot()));
  const missing = snapshot();
  missing.tasks.pop();
  assert.throws(() => assertFixtures(missing), /missing/);
  assert.doesNotThrow(() => assertFixtures(missing, { allowMissing: true }));
});

test("privacy guard rejects edited records, extra records, profile images and labels", () => {
  const changes = [
    state => { state.account.user.email = "someone@example.test"; },
    state => { state.account.user.image = "https://example.test/avatar.png"; },
    state => { state.tasks[0].title = "Private meeting"; },
    state => { state.tasks[0].description = "Confidential notes"; },
    state => { state.tasks[0].commentCount = 1; },
    state => { state.tasks.push({ ...state.tasks[0], id: "unknown" }); },
    state => { state.projects.push(state.projects[0]); },
    state => { state.goals[0].description = "Personal details"; },
    state => { state.metadata.labels.push({ name: "Private" }); },
    state => { state.metadata.filters.push({ name: "Private" }); },
  ];
  for (const change of changes) {
    const state = snapshot();
    change(state);
    assert.throws(() => assertFixtures(state));
  }
});

test("seed adds missing fixtures, resumes partial work and does not duplicate on reruns", async () => {
  const state = snapshot();
  state.projects = state.projects.slice(0, 1);
  state.goals = [];
  state.tasks = state.tasks.slice(0, 2);
  const { api, writes } = fakeApi(state);
  await seedDemo(api);
  assertFixtures(state);
  assert.equal(writes.filter(write => write.route === "/api/v1/projects").length, 2);
  assert.equal(writes.filter(write => write.route === "/api/v1/goals").length, 3);
  assert.equal(writes.filter(write => write.route === "/api/v1/tasks").length, 5);
  const priorWrites = writes.length;
  await seedDemo(api);
  assert.deepEqual(writes.slice(priorWrites), [{ route: "/api/v1/imports/todoist/prompt", data: undefined }]);
});

test("seed refuses unknown data before any writes", async () => {
  const state = snapshot();
  state.tasks[0].title = "Unexpected data";
  const { api, writes } = fakeApi(state);
  await assert.rejects(seedDemo(api));
  assert.equal(writes.length, 0);
});

test("API requests disable redirects and do not expose response bodies on failure", async () => {
  const api = apiClient({ fetch: async (url, settings) => {
    assert.equal(url, "http://localhost:5173/api/v1/account");
    assert.equal(settings.maxRedirects, 0);
    assert.equal(settings.headers.Origin, "http://localhost:5173");
    return new Response("sensitive diagnostic", { status: 403 });
  } }, "http://localhost:5173");
  await assert.rejects(api("GET", "/api/v1/account"), error => error.message.includes("HTTP 403") && !error.message.includes("sensitive"));
});

test("sign-up requires explicit seeding and a 401, never an arbitrary server failure", async () => {
  for (const [seed, status] of [[false, 401], [true, 500], [true, 403]]) {
    const calls = [];
    await assert.rejects(authenticate(async (method, route) => {
      calls.push(route);
      return new Response(null, { status });
    }, seed));
    assert.deepEqual(calls, ["/api/auth/sign-in/email"]);
  }
});
