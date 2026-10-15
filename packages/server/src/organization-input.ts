// Pure organization schemas (zod only, no database) so client bundles may import them.
import { z } from "zod";

const id = z.string().min(1).max(128);
const isoDate = z.iso.datetime({ offset: true });

/** Legacy createSection rule: trimmed, 1–200 characters. */
export const sectionInput = z.object({ projectId: id, name: z.string().trim().min(1).max(200) });
export const sectionNameInput = sectionInput.pick({ name: true }).strict();

/** A destination for one or more tasks: Inbox is `projectId: null`. */
export const taskDestination = z.object({ ids: z.array(id).min(1).max(200), projectId: id.nullable(), sectionId: id.nullable() });
export type TaskDestination = Omit<z.infer<typeof taskDestination>, "ids">;

/**
 * One task's organization change through `PATCH /api/v1/tasks/:id` (updateTask):
 * a move (project and section; a moved sub-task becomes a root, a parent carries
 * its sub-tasks) or a parent change (nesting joins the parent's project and
 * section; null un-nests). Never both, so a move cannot contradict a parent.
 * `updatedAt` is the copy the action started from (stale-edit check).
 */
export const taskOrganizationInput = z.union([
  z.object({ updatedAt: isoDate, projectId: id.nullable(), sectionId: id.nullable() }).strict()
    .refine(move => move.projectId !== null || move.sectionId === null, { path: ["sectionId"], message: "Inbox has no sections" }),
  z.object({ updatedAt: isoDate, parentId: id.nullable() }).strict(),
]);
export type TaskOrganizationInput = z.infer<typeof taskOrganizationInput>;
