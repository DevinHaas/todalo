"use client";

import { useCallback, useEffect, useState } from "react";
interface Attachment { id: string; name: string; byteSize: number }
export function TaskAttachments({ taskId }: { taskId: string }) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [error, setError] = useState(""); const [loading, setLoading] = useState(true);
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/attachments`, { signal, cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Attachments could not load. Please retry.");
      if (!signal?.aborted) { setAttachments(result); setError(""); }
    } catch (reason) { if (!signal?.aborted) setError(reason instanceof Error ? reason.message : "Attachments could not load. Please retry."); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [taskId]);
  // State changes in load occur after the external request settles.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  return <section aria-label="Attachments" className="space-y-2"><h2 className="text-sm font-medium">Attachments</h2>
    {loading && <p role="status" className="text-sm text-muted-foreground">Loading attachments…</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error} <button type="button" className="underline" onClick={() => { setLoading(true); setError(""); void load(); }}>Retry</button></p>}
    {!loading && !error && !attachments.length && <p className="text-sm text-muted-foreground">No attachments</p>}
    {attachments.map(attachment => <a key={attachment.id} href={`/api/attachments/${encodeURIComponent(attachment.id)}`} download={attachment.name} className="block break-all text-sm underline">{attachment.name} <span className="text-muted-foreground">({Math.max(1, Math.ceil(attachment.byteSize / 1024))} KB)</span></a>)}
  </section>;
}
