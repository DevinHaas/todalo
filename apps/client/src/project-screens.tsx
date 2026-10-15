import { useMemo } from "react";
import { useNavigate, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Account } from "./session";
import { projectReads, projects } from "./runtime";
import { projectMutations } from "./projects";
import { ProjectsView, ProjectView } from "./project-views";
import { ProjectFilesScreen } from "./attachment-screens";


function useProjectMutations(userId: string) {
  const cache = useQueryClient();
  return useMemo(() => projectMutations(projects, cache, userId), [cache, userId]);
}

export function ProjectsScreen({ account }: { account: Account }) {
  const query = useQuery(projectReads.list(account.user.id));
  const writes = useProjectMutations(account.user.id);
  const create = useMutation({ mutationFn: writes.create });
  return <ProjectsView state={query} onRetry={() => void query.refetch()} onCreate={create.mutateAsync} write={{ pending: create.isPending, error: create.error?.message ?? null }} />;
}

export function ProjectScreen({ account }: { account: Account }) {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const query = useQuery(projectReads.detail(account.user.id, id));
  const writes = useProjectMutations(account.user.id);
  const rename = useMutation({ mutationFn: (name: string) => writes.rename(id, name) });
  const remove = useMutation({ mutationFn: () => writes.remove(id), onSuccess: () => navigate("/projects", { replace: true }) });
  return <ProjectView
    key={id}
    state={query}
    onRetry={() => void query.refetch()}
    onRename={rename.mutateAsync}
    // The Inbox route is ticket 12, so deletion returns to Projects.
    onDelete={() => remove.mutate()}
    write={{ pending: rename.isPending || remove.isPending, error: (rename.error ?? remove.error)?.message ?? null }}
    files={<ProjectFilesScreen userId={account.user.id} projectId={id} />}
  />;
}
