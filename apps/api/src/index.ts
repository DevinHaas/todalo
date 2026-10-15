import { createApi, productionDependencies } from "./app";
import { auth } from "@todalo/auth";
import { getOwnedTask, getTodayTasksForUser } from "@todalo/server/today";
import { createAuthRoutes } from "./auth-routes";
import { createTaskRoutes } from "./task-routes";

const app = createApi(productionDependencies()).use(createAuthRoutes(auth)).use(createTaskRoutes({
  verify: async (headers) => (await auth.api.getSession({ headers, query: { disableCookieCache: true } }))?.user.id ?? null,
  today: (userId) => getTodayTasksForUser(userId),
  task: getOwnedTask,
})).listen({
  port: Number(process.env.RAMBLE_PORT ?? 3001),
  hostname: process.env.RAMBLE_HOST ?? "0.0.0.0",
});
console.log(`Ramble API listening on port ${app.server?.port}`);
