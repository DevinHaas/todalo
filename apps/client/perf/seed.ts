// Signs in the local test account and keeps its perf data set fixed between runs: a few hundred
// "Perf seed …" tasks (Today, the next 14 days, Inbox). Each run's completions, quick adds and
// composer adds are undone first, so every run measures the same list.
import { request, type APIRequestContext } from "playwright";
import type { TaskDto } from "../../../packages/server/src/task-dto";

export const account = { email: process.env.PERF_EMAIL ?? "tester@todalo.local", password: process.env.PERF_PASSWORD ?? "todalo-sim-2026" };
export const groups = { today: 250, upcoming: 100, inbox: 50 } as const;

export async function signIn(base: string) {
  const api = await request.newContext({ baseURL: base, extraHTTPHeaders: { origin: base } });
  const response = await api.post("/api/auth/sign-in/email", { data: account });
  if (!response.ok()) throw new Error(`sign-in failed: ${response.status()} ${await response.text()}`);
  return api;
}

const day = (offset: number) => { const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() + offset); return date.toISOString(); };

async function pool<T>(items: T[], size: number, work: (item: T) => Promise<unknown>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: size }, async () => { for (let item; (item = queue.shift()) !== undefined;) await work(item); }));
}

export async function tasks(api: APIRequestContext): Promise<TaskDto[]> {
  const response = await api.get("/api/v1/today");
  if (!response.ok()) throw new Error(`today failed: ${response.status()}`);
  return (await response.json()).tasks;
}

export async function seed(api: APIRequestContext) {
  // A new account's one-time "Import from Todoist?" dialog would cover the page.
  await api.post("/api/v1/imports/todoist/prompt");
  const all = await tasks(api);
  const junk = all.filter(task => /^Perf (quick|composer) /.test(task.title) || (task.title.startsWith("Perf seed") && task.status === "done"));
  await pool(junk, 6, task => api.delete(`/api/v1/tasks/${task.id}`));
  const have = new Set(all.filter(task => !junk.includes(task)).map(task => task.title.match(/^Perf seed (\w+ \d+)/)?.[1]).filter(Boolean));
  const missing: { title: string; dueDate: string | null }[] = [];
  for (const [group, count] of Object.entries(groups)) for (let n = 1; n <= count; n++) {
    const key = `${group} ${String(n).padStart(3, "0")}`;
    if (!have.has(key)) missing.push({ title: `Perf seed ${key}`, dueDate: group === "today" ? day(0) : group === "upcoming" ? day(1 + (n % 14)) : null });
  }
  await pool(missing, 6, async task => {
    const response = await api.post("/api/v1/tasks", { data: { id: crypto.randomUUID(), ...task } });
    if (!response.ok()) throw new Error(`create failed: ${response.status()} ${await response.text()}`);
  });
  return { deleted: junk.length, created: missing.length, total: (await tasks(api)).length };
}
