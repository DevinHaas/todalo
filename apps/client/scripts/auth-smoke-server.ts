// Isolated manual QA service: no production auth/database imports or .env data.
import { memoryAdapter } from "better-auth/adapters/memory";
import { createSessionAuth } from "../../../packages/auth/src/config";
import { createAuthRoutes } from "../../api/src/auth-routes";
import { createTaskRoutes } from "../../api/src/task-routes";
import type { TaskRecord } from "../../../packages/server/src/task-dto";

const auth = createSessionAuth({
  database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
  baseURL: "http://localhost:5173",
  secret: "local-smoke-test-only-secret-32-characters",
  trustedOrigins: ["http://localhost:5173"],
});
const { user } = await auth.api.signUpEmail({ body: { name: "Development User", email: "existing@example.test", password: "dev-password-123" } });
const { user: other } = await auth.api.signUpEmail({ body: { name: "Other User", email: "other@example.test", password: "dev-password-123" } });

// Fixture tasks mirror docs/qa/tauri-baseline-fixture.ts, relative to the service's start day.
const day = (offset: number, hours = 0, minutes = 0) => { const date = new Date(); date.setDate(date.getDate() + offset); date.setHours(hours, minutes, 0, 0); return date; };
const task = (id: string, userId: string, title: string, extra: Partial<TaskRecord> = {}) => ({
  id, userId, title, description: null, status: "todo" as const, priority: 4, projectId: null, parentId: null,
  dueDate: null, dueDateEnd: null, deadline: null, completedAt: null, labelIds: [] as string[], ...extra,
});
const tasks = [
  task("overdue-review", user.id, "Review the migration checklist", { dueDate: day(-1, 12), priority: 2, description: "Walk through every inventory row before the cutover." }),
  task("shared-screen", user.id, "Plan the first shared screen", { dueDate: day(0, 14, 30), labelIds: ["design"], deadline: day(3) }),
  task("future", user.id, "Future fixture task", { dueDate: day(2) }),
  task("undated", user.id, "Undated fixture task"),
  task("completed", user.id, "Completed fixture task", { dueDate: day(0, 9), status: "done", completedAt: day(0, 9) }),
  task("other-private", other.id, "Another user's private task", { dueDate: day(0, 10) }),
];
if (process.env.QA_EMPTY_TODAY) tasks.splice(0, 5);
const tomorrow = day(1);

createAuthRoutes(auth).use(createTaskRoutes({
  verify: async (headers) => (await auth.api.getSession({ headers, query: { disableCookieCache: true } }))?.user.id ?? null,
  // ponytail: inline copy of countTodayTasks; importing @todalo/server/today would pull in the production DB client.
  today: async (userId) => {
    const owned = tasks.filter(item => item.userId === userId);
    return { tasks: owned, openCount: owned.filter(item => item.status !== "done" && item.dueDate && item.dueDate < tomorrow).length };
  },
  task: async (userId, id) => tasks.find(item => item.userId === userId && item.id === id) ?? null,
})).listen({ hostname: "127.0.0.1", port: 3009 });
console.log("Isolated account QA API listening on 127.0.0.1:3009");
