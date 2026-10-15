"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth";
import * as organization from "@todalo/server/organization";
import type { TaskDestination } from "@todalo/server/organization-input";

// Thin wrappers over @todalo/server/organization (shared with /api/v1).
export async function getOrganizationDestinations() {
  return organization.getOrganizationDestinations(await requireUserId());
}
export async function createSection(projectId: string, name: string) {
  const section = await organization.createSection(await requireUserId(), projectId, name);
  revalidatePath("/", "layout");
  return section;
}
export async function deleteSection(id: string) {
  await organization.deleteSection(await requireUserId(), id);
  revalidatePath("/", "layout");
}
export async function moveTasks(ids: string[], input: TaskDestination) {
  await organization.moveTasks(await requireUserId(), ids, input);
  revalidatePath("/", "layout");
}
export async function setTaskParent(taskId: string, parentId: string | null) {
  await organization.setTaskParent(await requireUserId(), taskId, parentId);
  revalidatePath("/", "layout");
}
