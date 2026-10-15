import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { attachmentReads, attachments } from "./runtime";
import { attachmentKeys, attachmentMutations, type AttachmentDto } from "./attachments";
import { AccountTransportError } from "./errors";
import { ProjectFiles, TaskAttachments } from "./attachment-views";

export function ProjectFilesScreen({ userId, projectId }: { userId: string; projectId: string }) {
  const cache = useQueryClient();
  const writes = useMemo(() => attachmentMutations(attachments, cache, userId), [cache, userId]);
  return <ProjectFiles upload={files => writes.upload(projectId, files)} />;
}

export function TaskAttachmentsScreen({ userId, taskId }: { userId: string; taskId: string }) {
  const cache = useQueryClient();
  const query = useQuery(attachmentReads.task(userId, taskId));
  const save = useMutation({
    mutationFn: async (attachment: AttachmentDto) => {
      const saved = await attachments.save!(attachment);
      // Gone since the list loaded (or never the user's): refresh the list.
      if (!saved) { await cache.invalidateQueries({ queryKey: attachmentKeys.task(userId, taskId) }); throw new AccountTransportError("DOWNLOAD_FAILED"); }
      return saved;
    },
  });
  return <TaskAttachments
    state={query}
    onRetry={() => void query.refetch()}
    href={attachments.href}
    onSave={attachments.save && (attachment => save.mutate(attachment))}
    saving={{ pending: save.isPending, saved: save.data ?? null, error: save.error?.message ?? null }}
  />;
}
