import { eq } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";

export function getRambleProjects(userId: string) {
  return db.select({ id: projects.id, name: projects.name, color: projects.color })
    .from(projects).where(eq(projects.userId, userId)).orderBy(projects.name);
}
