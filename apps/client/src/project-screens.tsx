import { useMemo } from "react";
import { useNavigate, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Account } from "./session";
import { projectReads, projects } from "./runtime";
import { projectMutations } from "./projects";
import { ProjectsView, ProjectView } from "./project-views";
import { ProjectFilesScreen } from "./attachment-screens";
import { useOrganizationMutations } from "./organization-screens";
import { useBulkSelection, useReorder } from "./bulk-screens";
import { treeOrder, type TaskDto } from "./tasks";
import { useDisplay } from "./schedule-views";
import { ProjectCalendar } from "./schedule-screens";
import { BoardScreen } from "./board-screens";
import { useTaskWrites } from "./task-writes";
import { ProjectGoals } from "./goal-screens";


function useProjectMutations(userId: string) {
  const cache = useQueryClient();
  return useMemo(() => projectMutations(projects, cache, userId), [cache, userId]);
}

export function ProjectsScreen({ account }: { account: Account }) {
  const query = useQuery(projectReads.list(account.user.id));
  const writes = useProjectMutations(account.user.id);
  const create = useMutation({ mutationFn: writes.create, meta: { action: (name: string) => `add the project "${name}"` } });
  return <ProjectsView state={query} onRetry={() => void query.refetch()} onCreate={create.mutateAsync} write={{ pending: create.isPending, error: create.error?.message ?? null }} />;
}

export function ProjectScreen({ account }: { account: Account }) {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const query = useQuery(projectReads.detail(account.user.id, id));
  const writes = useProjectMutations(account.user.id);
  const organization = useOrganizationMutations(account.user.id);
  const rename = useMutation({ mutationFn: (name: string) => writes.rename(id, name), meta: { action: () => "rename the project" } });
  // Legacy: its tasks move to the Inbox, which opens.
  const remove = useMutation({ mutationFn: () => writes.remove(id), meta: { action: () => "delete the project" }, onSuccess: () => navigate("/inbox", { replace: true }) });
  const createSection = useMutation(organization.createSection);
  const removeSection = useMutation(organization.removeSection);
  const order = useReorder(account.user.id);
  const tasks = useTaskWrites(account.user.id);
  // Legacy ProjectView handed Board and Calendar the tasks Display shows (completed only when switched on).
  const display = useDisplay();
  const shown = (tasks: TaskDto[]) => display.showCompleted ? tasks : tasks.filter(task => task.status !== "done");
  const selection = useBulkSelection(account.user.id, query.data ? treeOrder(shown(query.data.tasks)) : []);
  const pending = rename.isPending || remove.isPending || createSection.isPending || removeSection.isPending;
  const layout = display.layout === "board" ? (tasks: TaskDto[]) => <BoardScreen account={account} tasks={shown(tasks)} />
    : display.layout === "calendar" ? (tasks: TaskDto[]) => <ProjectCalendar account={account} tasks={shown(tasks)} projectId={id} /> : undefined;
  return <ProjectView
    key={id}
    state={query}
    onRetry={() => void query.refetch()}
    onRename={rename.mutateAsync}
    onDelete={() => remove.mutate()}
    sections={{ create: (name) => createSection.mutateAsync({ projectId: id, name }), remove: (section) => removeSection.mutate(section) }}
    write={{ pending, error: (rename.error ?? remove.error ?? createSection.error ?? removeSection.error)?.message ?? order.error ?? tasks.error }}
    selection={selection}
    reorder={order.reorder}
    layout={layout}
    files={<ProjectFilesScreen userId={account.user.id} projectId={id} />}
    goals={<ProjectGoals userId={account.user.id} projectId={id} />}
    onCreate={(task) => tasks.create.mutateAsync(task)}
    actions={tasks.actions}
    showCompleted={display.showCompleted}
  />;
}
