// Pure Todoist → todalo import planning. No network or DB: the caller fetches
// a Todoist sync snapshot, loads existing mappings/labels, and inserts the plan.
// Rules: .scratch/todoist-import/spec.md ("Mapping rules").
import { parseQuickAdd } from "@todalo/ramble/quick-add";
import type { Recurrence } from "@todalo/ramble/recurrence";
import { zonedTaskDate } from "./dates";

export const TODOIST = "todoist";

// Subset of Todoist API v1 sync resources that the import reads.
export interface TodoistDue { date: string; timezone?: string | null; string?: string | null; is_recurring?: boolean }
export interface TodoistProject { id: string; name: string; color?: string | null; parent_id?: string | null; child_order?: number; inbox_project?: boolean; is_deleted?: boolean; is_archived?: boolean }
export interface TodoistSection { id: string; project_id: string; name: string; section_order?: number; is_deleted?: boolean; is_archived?: boolean }
export interface TodoistItem {
  id: string; project_id: string; section_id?: string | null; parent_id?: string | null;
  content: string; description?: string | null; priority?: number; child_order?: number;
  due?: TodoistDue | null; deadline?: { date: string } | null;
  duration?: { amount: number; unit: "minute" | "day" } | null;
  labels?: string[]; checked?: boolean; is_deleted?: boolean; completed_at?: string | null;
}
export interface TodoistLabel { id: string; name: string; color?: string | null; is_deleted?: boolean }
export interface TodoistNote { id: string; item_id: string; content?: string | null; is_deleted?: boolean; file_attachment?: { file_name?: string | null; file_url?: string | null } | null }
export interface TodoistSnapshot { projects: TodoistProject[]; sections: TodoistSection[]; items: TodoistItem[]; labels: TodoistLabel[]; notes: TodoistNote[] }

export interface ImportSelection {
  projectIds: string[];
  include: { sections: boolean; subtasks: boolean; labels: boolean; recurring: boolean; comments: boolean; completed: boolean };
}

export type MappingKind = "project" | "section" | "task" | "label";
export interface ImportContext {
  /** `${kind}:${externalId}` → localId, only for mappings whose local row still exists. */
  mapped: Map<string, string>;
  existingLabels: { id: string; name: string }[];
  timeZone: string;
}

export interface PlannedTask {
  id: string; projectId: string | null; sectionId: string | null; parentId: string | null;
  title: string; description: string | null; priority: number;
  dueDate: Date | null; dueDateEnd: Date | null; deadline: Date | null; recurrence: Recurrence | null;
  status: "todo" | "done"; completedAt: Date | null; sortOrder: number;
}
export interface ImportPlan {
  projects: { id: string; name: string; color: string | null }[];
  sections: { id: string; projectId: string; name: string; sortOrder: number }[];
  labels: { id: string; name: string; color: string | null }[];
  tasks: PlannedTask[];
  taskLabels: { taskId: string; labelId: string }[];
  mappings: { kind: MappingKind; externalId: string; localId: string }[];
  skipped: number;
  warnings: string[];
}

// Todoist's named palette (developer docs "Colors").
const COLORS: Record<string, string> = {
  berry_red: "#b8256f", red: "#db4035", orange: "#ff9933", yellow: "#fad000", olive_green: "#afb83b",
  lime_green: "#7ecc49", green: "#299438", mint_green: "#6accbc", teal: "#158fad", sky_blue: "#14aaf5",
  light_blue: "#96c3eb", blue: "#4073ff", grape: "#884dff", violet: "#af38eb", lavender: "#eb96eb",
  magenta: "#e05194", salmon: "#ff8d85", charcoal: "#808080", grey: "#b8b8b8", taupe: "#ccac93",
};
const color = (name?: string | null) => (name && COLORS[name]) || null;

/** Todoist due/deadline date → instant. Date-only and floating times use `zone`; a trailing Z is fixed UTC. */
export function todoistInstant(date: string, zone: string): { at: Date; timed: boolean } {
  const match = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?(Z)?)?$/.exec(date);
  if (!match) throw new Error(`Unrecognised Todoist date ${date}`);
  const [, day, time, utc] = match;
  if (utc) return { at: new Date(date), timed: true };
  return { at: zonedTaskDate(day, time ?? null, zone)!, timed: Boolean(time) };
}

/** Todoist recurrence text → todalo Recurrence, or null when it cannot be represented. */
export function todoistRecurrence(text: string): Recurrence | null {
  const recurrence = parseQuickAdd(text.replace(/\bevery!/i, "every")).recurrence;
  if (!recurrence) return null;
  // "every!" and "after …" repeat from the completion date in Todoist.
  return /\bevery!|\bafter\b/i.test(text) ? { ...recurrence, basedOn: "completed" } : recurrence;
}

export function planTodoistImport(snapshot: TodoistSnapshot, selection: ImportSelection, context: ImportContext): ImportPlan {
  const { include } = selection;
  const plan: ImportPlan = { projects: [], sections: [], labels: [], tasks: [], taskLabels: [], mappings: [], skipped: 0, warnings: [] };
  const known = (kind: MappingKind, id: string) => context.mapped.get(`${kind}:${id}`);
  const record = (kind: MappingKind, externalId: string, localId: string) => {
    context.mapped.set(`${kind}:${externalId}`, localId);
    plan.mappings.push({ kind, externalId, localId });
  };

  // Projects: flatten nesting into "Parent / Child"; Inbox maps to todalo's Inbox (null).
  const projects = new Map(snapshot.projects.filter((p) => !p.is_deleted).map((p) => [p.id, p]));
  const selected = new Set(selection.projectIds.filter((id) => projects.has(id)));
  const projectPath = (project: TodoistProject): string => {
    const parent = project.parent_id ? projects.get(project.parent_id) : undefined;
    return parent && !parent.inbox_project ? `${projectPath(parent)} / ${project.name}` : project.name;
  };
  const localProject = new Map<string, string | null>();
  for (const project of snapshot.projects) {
    if (!selected.has(project.id)) continue;
    if (project.inbox_project) { localProject.set(project.id, null); continue; }
    const existing = known("project", project.id);
    if (existing) { localProject.set(project.id, existing); continue; }
    const id = crypto.randomUUID();
    plan.projects.push({ id, name: projectPath(project), color: color(project.color) });
    record("project", project.id, id);
    localProject.set(project.id, id);
  }

  // Sections belong to a real project; Inbox sections have nowhere to live.
  const localSection = new Map<string, string>();
  if (include.sections) {
    for (const section of snapshot.sections) {
      if (section.is_deleted || !localProject.has(section.project_id)) continue;
      const projectId = localProject.get(section.project_id);
      if (!projectId) continue;
      const existing = known("section", section.id);
      if (existing) { localSection.set(section.id, existing); continue; }
      const id = crypto.randomUUID();
      plan.sections.push({ id, projectId, name: section.name, sortOrder: section.section_order ?? 0 });
      record("section", section.id, id);
      localSection.set(section.id, id);
    }
  }

  // Labels are reused by case-insensitive name, created at most once.
  const labelByName = new Map(context.existingLabels.map((l) => [l.name.toLowerCase(), l.id]));
  const todoistLabels = new Map(snapshot.labels.filter((l) => !l.is_deleted).map((l) => [l.name.toLowerCase(), l]));
  const labelId = (name: string) => {
    const key = name.toLowerCase();
    const reused = labelByName.get(key);
    if (reused) return reused;
    const source = todoistLabels.get(key);
    const externalId = source?.id ?? `name:${key}`;
    const id = known("label", externalId) ?? crypto.randomUUID();
    if (!known("label", externalId)) {
      plan.labels.push({ id, name, color: color(source?.color) });
      record("label", externalId, id);
    }
    labelByName.set(key, id);
    return id;
  };

  const items = snapshot.items.filter((i) => !i.is_deleted && localProject.has(i.project_id) && (include.completed || !i.checked));
  const byId = new Map(items.map((i) => [i.id, i]));
  const notes = new Map<string, string[]>();
  if (include.comments) {
    for (const note of snapshot.notes) {
      if (note.is_deleted) continue;
      const file = note.file_attachment;
      const text = [note.content?.trim(), file?.file_name && [file.file_name, file.file_url].filter(Boolean).join(" ")].filter(Boolean).join("\n");
      if (text) notes.set(note.item_id, [...(notes.get(note.item_id) ?? []), text]);
    }
  }

  // Top-level ancestor among imported items; todalo sub-tasks are one level deep.
  const parentOf = (item: TodoistItem) => (item.parent_id ? byId.get(item.parent_id) : undefined);
  const depthOf = (item: TodoistItem) => {
    let depth = 0;
    for (let parent = parentOf(item); parent; parent = parentOf(parent)) depth++;
    return depth;
  };
  const rootOf = (item: TodoistItem): TodoistItem | null => {
    let root: TodoistItem | null = null;
    for (let parent = parentOf(item); parent; parent = parentOf(parent)) root = parent;
    return root;
  };

  // Roots first so a sub-task can reference its parent's local ID.
  const depth = new Map(items.map((i) => [i.id, depthOf(i)]));
  const ordered = [...items].sort((a, b) => Math.min(1, depth.get(a.id)!) - Math.min(1, depth.get(b.id)!));
  const localTask = new Map<string, string>();
  let recurringDropped = 0;
  let flattened = 0;
  for (const item of ordered) {
    const existing = known("task", item.id);
    if (existing) { localTask.set(item.id, existing); plan.skipped++; continue; }
    const root = include.subtasks ? rootOf(item) : null;
    if (root && depth.get(item.id)! > 1) flattened++;
    const parentId = root ? localTask.get(root.id) ?? known("task", root.id) ?? null : null;
    const id = crypto.randomUUID();
    const due = item.due ? todoistInstant(item.due.date, item.due.timezone ?? context.timeZone) : null;
    let dueDateEnd: Date | null = null;
    if (due && item.duration) {
      const minutes = item.duration.unit === "day" ? item.duration.amount * 1440 : item.duration.amount;
      if (due.timed || item.duration.unit === "day") dueDateEnd = new Date(due.at.getTime() + minutes * 60_000);
    }
    let recurrence: Recurrence | null = null;
    if (item.due?.is_recurring && include.recurring) {
      recurrence = todoistRecurrence(item.due.string ?? "");
      if (!recurrence) recurringDropped++;
    }
    const comments = notes.get(item.id);
    const description = [item.description?.trim() || null, comments?.length ? `---\n${comments.join("\n\n")}` : null].filter(Boolean).join("\n\n") || null;
    plan.tasks.push({
      id, projectId: localProject.get(item.project_id) ?? null,
      sectionId: (item.section_id && localSection.get(item.section_id)) || null,
      parentId, title: item.content, description,
      priority: 5 - Math.min(4, Math.max(1, item.priority ?? 1)),
      dueDate: due?.at ?? null, dueDateEnd,
      deadline: item.deadline ? todoistInstant(item.deadline.date, context.timeZone).at : null,
      recurrence,
      status: item.checked ? "done" : "todo",
      completedAt: item.checked ? new Date(item.completed_at ?? Date.now()) : null,
      sortOrder: item.child_order ?? 0,
    });
    record("task", item.id, id);
    localTask.set(item.id, id);
    if (include.labels) for (const name of item.labels ?? []) plan.taskLabels.push({ taskId: id, labelId: labelId(name) });
  }

  if (flattened) plan.warnings.push(`${flattened} nested sub-task${flattened === 1 ? " was moved under its top-level task" : "s were moved under their top-level tasks"} (todalo has one sub-task level).`);
  if (recurringDropped) plan.warnings.push(`${recurringDropped} recurring schedule${recurringDropped === 1 ? "" : "s"} could not be converted and kept only the next date.`);
  return plan;
}
