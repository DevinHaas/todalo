"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import * as projects from "@todalo/server/projects";
import { requireUserId } from "@/lib/auth";

const projectInput = z.object({
  name: z.string().trim().min(1).max(200),
  color: z.string().optional(),
});

export async function createProject(input: z.infer<typeof projectInput>) {
  const userId = await requireUserId();
  await projects.createProject(userId, projectInput.parse(input));
  revalidatePath("/", "layout");
}

export async function updateProject(id: string, input: z.infer<typeof projectInput>) {
  const userId = await requireUserId();
  await projects.updateProject(userId, id, projectInput.parse(input));
  revalidatePath("/", "layout");
}

export async function deleteProject(id: string) {
  const userId = await requireUserId();
  await projects.deleteProject(userId, id);
  revalidatePath("/", "layout");
}
