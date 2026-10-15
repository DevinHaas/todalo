import { getTasksForUser as queryTasks, getTodayTasksForUser } from "@todalo/server/today";

export { getTodayTasksForUser, countTodayTasks, getOwnedTask } from "@todalo/server/today";

export async function getTasksForUser(userId: string, projectId?: string) {
  return queryTasks(userId, projectId);
}

export type Task = Awaited<ReturnType<typeof getTasksForUser>>[number];

export async function getTodayTaskCount(userId: string) {
  return (await getTodayTasksForUser(userId)).openCount;
}
