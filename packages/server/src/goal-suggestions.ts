// Rule-based goal suggestions (goals ticket 03). Pure: no database, no AI, so
// it works without a provider and an AI suggester (ticket 25) can merge its
// ranking on top of this one.

export interface SuggestionTask { id: string; projectId: string | null; labelIds: string[] }
export interface SuggestionInput {
  task: SuggestionTask;
  /** The user's other tasks (the task itself is ignored if present). */
  tasks: SuggestionTask[];
  taskLinks: { goalId: string; taskId: string }[];
  /** Goals linked to whole projects; one linked to the task's own project counts as two sibling links. */
  projectLinks: { goalId: string; projectId: string }[];
  /** Active goals in the user's order: the only candidates, and the tie-break. */
  goalIds: string[];
  /** Goals the user dismissed for this task. */
  dismissed: string[];
}

/**
 * Goals that related tasks (same project, or sharing a label) or the task's own
 * project link to, ranked by weight: 1 per related task, 2 for the project link. Empty once the task has an active goal.
 */
export function suggestGoals({ task, tasks, taskLinks, projectLinks, goalIds, dismissed }: SuggestionInput): string[] {
  const active = new Set(goalIds);
  if (taskLinks.some(link => link.taskId === task.id && active.has(link.goalId))) return [];
  const labels = new Set(task.labelIds);
  const related = new Set(tasks.filter(other => other.id !== task.id
    && ((task.projectId !== null && other.projectId === task.projectId) || other.labelIds.some(id => labels.has(id)))).map(other => other.id));
  const counts = new Map<string, number>();
  // A link row is unique per goal and task, so each related task counts once per goal.
  const add = (goalId: string, weight: number) => counts.set(goalId, (counts.get(goalId) ?? 0) + weight);
  for (const link of taskLinks) if (related.has(link.taskId)) add(link.goalId, 1);
  for (const link of projectLinks) if (task.projectId !== null && link.projectId === task.projectId) add(link.goalId, 2);
  return goalIds.filter(id => counts.has(id) && !dismissed.includes(id)).sort((a, b) => counts.get(b)! - counts.get(a)!);
}
