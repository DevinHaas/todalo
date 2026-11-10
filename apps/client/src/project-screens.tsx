import { useContext, useMemo, useState } from "react";
import { NavLink, useNavigate, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Hash } from "lucide-react";
import type { Account } from "./session";
import { projectReads, projects } from "./runtime";
import { projectMutations, type NewProject, type ProjectChange, type ProjectDisplay } from "./projects";
import { ProjectsView, ProjectView, type DateActions, type ProjectActions, type ProjectsActions, type SectionActions } from "./project-views";
import { ProjectFilesScreen } from "./attachment-screens";
import { useOrganizationMutations } from "./organization-screens";
import { useBulkSelection, useReorder } from "./bulk-screens";
import { treeOrder, type TaskDto } from "./tasks";
import { DisplayOverride } from "./schedule-views";
import { ProjectCalendar } from "./schedule-screens";
import { useTaskWrites } from "./task-writes";
import { ProjectGoals } from "./goal-screens";
import { ComposerChoices } from "./composer";
import { datedDetails, deadlineDetails, dueDetails } from "./schedule";
import { copyProjectLink } from "./links";
import { inlineError, toasts } from "./toasts";
import { defaultProjectDisplay } from "../../../packages/server/src/project-dto";
import { SidebarSectionHeader, sidebarItemClassName } from "./ui";

function useProjectMutations(userId: string) {
  const cache = useQueryClient();
  return useMemo(() => projectMutations(projects, cache, userId), [cache, userId]);
}

/** Project writes, toasted on failure (meta.action), with the pending flag for dialogs. */
function useProjectWrites(userId: string) {
  const writes = useProjectMutations(userId);
  const create = useMutation({ mutationFn: writes.create, meta: { action: (project: NewProject) => `add the project "${project.name}"` } });
  const update = useMutation({ mutationFn: ({ id, change }: { id: string; change: ProjectChange }) => writes.update(id, change), meta: { action: () => "save the project" } });
  const remove = useMutation({ mutationFn: writes.remove, meta: { action: () => "delete the project" } });
  return { create, update, remove, pending: create.isPending || update.isPending || remove.isPending };
}

export function ProjectsScreen({ account }: { account: Account }) {
  const query = useQuery(projectReads.list(account.user.id));
  const writes = useProjectWrites(account.user.id);
  const actions: ProjectsActions = {
    create: writes.create.mutateAsync,
    update: (id, change) => writes.update.mutateAsync({ id, change }),
    remove: writes.remove.mutateAsync,
  };
  return <ProjectsView state={query} onRetry={() => void query.refetch()} actions={actions} write={{ pending: writes.pending }} />;
}

/** The sidebar's My Projects: every project that is not archived. */
export function ProjectsSidebar({ userId }: { userId: string }) {
  const active = (useQuery(projectReads.list(userId)).data ?? []).filter(project => !project.archived);
  if (!active.length) return null;
  return <section className="ui mb-3 flex flex-col" aria-label="My Projects">
    <SidebarSectionHeader title={<NavLink to="/projects" end className="no-underline">My Projects</NavLink>} />
    {active.map(project => <NavLink key={project.id} to={`/projects/${encodeURIComponent(project.id)}`} className={sidebarItemClassName}>
      <Hash style={{ color: project.color ?? "var(--color-priority-4)" }} /><span className="flex-1 truncate">{project.name}</span>
    </NavLink>)}
  </section>;
}

export function ProjectScreen({ account }: { account: Account }) {
  const userId = account.user.id;
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const query = useQuery(projectReads.detail(userId, id));
  const writes = useProjectWrites(userId);
  const organization = useOrganizationMutations(userId);
  const createSection = useMutation(organization.createSection);
  const renameSection = useMutation(organization.renameSection);
  const removeSection = useMutation(organization.removeSection);
  const organize = useMutation(organization.organize);
  const order = useReorder(userId);
  const tasks = useTaskWrites(userId);
  const labels = useContext(ComposerChoices).labels ?? [];
  const [deleted, setDeleted] = useState(false);
  const display: ProjectDisplay = query.data?.project.display ?? defaultProjectDisplay;
  const shown = (list: TaskDto[]) => display.showCompleted ? list : list.filter(task => task.status !== "done");
  const selection = useBulkSelection(userId, query.data ? treeOrder(shown(query.data.tasks)) : []);
  const project: ProjectActions = {
    update: (change) => writes.update.mutateAsync({ id, change }),
    // Legacy: its tasks move to the Inbox, which opens.
    remove: () => { setDeleted(true); writes.remove.mutate(id, { onSuccess: () => navigate("/inbox", { replace: true }), onError: () => setDeleted(false) }); },
    copyLink: () => { copyProjectLink(id).then(() => toasts.add({ title: "Link copied to clipboard" }), (reason: unknown) => toasts.add({ title: "Could not copy the link", description: inlineError(reason) })); },
  };
  const sections: SectionActions = {
    create: (name, after) => createSection.mutateAsync({ projectId: id, name, ...after === undefined ? {} : { after } }),
    rename: (section, name) => renameSection.mutateAsync({ section, name }),
    remove: (section) => removeSection.mutate(section),
  };
  const update = (task: TaskDto, details: Parameters<typeof tasks.update.mutate>[0]["details"]) => tasks.update.mutate({ id: task.id, details });
  const dates: DateActions = {
    due: (task, day) => update(task, day ? dueDetails(task, day) : datedDetails(task, { dueDate: null, dueDateEnd: null })),
    deadline: (task, day) => update(task, deadlineDetails(task, day)),
  };
  const calendarDisplay = { layout: "calendar" as const, showCompleted: display.showCompleted, calendarRange: display.calendarRange,
    set: (change: { calendarRange?: ProjectDisplay["calendarRange"]; showCompleted?: boolean }) => void project.update({ display: { ...display, ...change } }).catch(() => {}) };
  return <ProjectView
    key={id}
    state={deleted ? { status: "pending", error: null } : query}
    onRetry={() => void query.refetch()}
    write={{ pending: writes.pending || createSection.isPending || renameSection.isPending }}
    project={project}
    sections={sections}
    display={display}
    labels={labels}
    calendar={(list) => <DisplayOverride value={calendarDisplay}><ProjectCalendar account={account} tasks={list} projectId={id} /></DisplayOverride>}
    selection={selection}
    reorder={order.reorder}
    move={(task, sectionId) => organize.mutate({ task, change: { projectId: id, sectionId } })}
    files={<ProjectFilesScreen userId={userId} projectId={id} />}
    goals={<ProjectGoals userId={userId} projectId={id} />}
    onCreate={(task) => tasks.create.mutateAsync(task)}
    actions={tasks.actions}
    dates={dates}
  />;
}
