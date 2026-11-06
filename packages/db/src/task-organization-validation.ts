export interface OrganizationInput { userId: string; projectId: string | null; sectionId: string | null }
export interface OwnedProject { id: string; userId: string }
export interface OwnedSection extends OwnedProject { projectId: string }

/**
 * A refused organization change. `missing`: a project, section or parent that is
 * absent or another user's (transports answer 404); `invalid`: a hierarchy rule
 * (self-parent, depth, parent with sub-tasks) the request broke (400).
 */
export class TaskOrganizationError extends Error {
  constructor(message: string, readonly reason: "missing" | "invalid") { super(message); this.name = "TaskOrganizationError"; }
}

export function validateTaskOrganization(input: OrganizationInput, project?: OwnedProject, section?: OwnedSection): void {
  if (input.projectId && (!project || project.id !== input.projectId || project.userId !== input.userId)) throw new TaskOrganizationError("Project not found", "missing");
  if (input.sectionId && (!section || section.id !== input.sectionId || section.userId !== input.userId || !input.projectId || section.projectId !== input.projectId)) throw new TaskOrganizationError("Section not found", "missing");
}
