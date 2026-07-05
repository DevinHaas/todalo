"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { requireUserId } from "@/lib/auth";

const projectInput = z.object({
  name: z.string().min(1),
  color: z.string().optional(),
});

export async function createProject(input: z.infer<typeof projectInput>) {
  const userId = await requireUserId();
  const data = projectInput.parse(input);
  await db.insert(projects).values({ userId, ...data });
  revalidatePath("/");
}

export async function updateProject(id: string, input: z.infer<typeof projectInput>) {
  const userId = await requireUserId();
  const data = projectInput.parse(input);
  await db
    .update(projects)
    .set(data)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)));
  revalidatePath("/");
}

export async function deleteProject(id: string) {
  const userId = await requireUserId();
  await db.delete(projects).where(and(eq(projects.id, id), eq(projects.userId, userId)));
  revalidatePath("/");
}
