export interface OrganizationInput { userId: string; projectId: string | null; sectionId: string | null }
export interface OwnedProject { id: string; userId: string }
export interface OwnedSection extends OwnedProject { projectId: string }

export function validateTaskOrganization(input: OrganizationInput, project?: OwnedProject, section?: OwnedSection): void {
  if (input.projectId && (!project || project.id !== input.projectId || project.userId !== input.userId)) throw new Error("Project not found");
  if (input.sectionId && (!section || section.id !== input.sectionId || section.userId !== input.userId || !input.projectId || section.projectId !== input.projectId)) throw new Error("Section not found");
}
