import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { organization, organizationReads, reads } from "./runtime";
import { organizationMutations } from "./organization";
import { TaskOrganizer } from "./organization-views";
import type { TaskDto } from "./tasks";

export function useOrganizationMutations(userId: string) {
  const cache = useQueryClient();
  return useMemo(() => organizationMutations(organization, cache, userId), [cache, userId]);
}

/** Move / Nest / Unnest on the task page. Parents come from the full task collection behind Today. */
export function TaskOrganizerScreen({ userId, task }: { userId: string; task: TaskDto }) {
  const destinations = useQuery(organizationReads.destinations(userId));
  const all = useQuery(reads.today(userId));
  const organize = useMutation(useOrganizationMutations(userId).organize);
  return <TaskOrganizer task={task} tasks={all.data?.tasks} destinations={destinations} onRetryDestinations={() => void destinations.refetch()}
    onOrganize={(change) => organize.mutateAsync({ task, change })} />;
}
