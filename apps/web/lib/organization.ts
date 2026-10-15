import { getOwnedProject } from "@todalo/server/projects";

export { getProjectsForUser } from "@todalo/server/projects";
export { getSectionsForUser } from "@todalo/server/organization";
export async function getProjectForUser(userId: string, id: string) {
  return (await getOwnedProject(userId, id)) ?? undefined;
}
