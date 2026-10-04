"use client";

import { useEffect, useMemo, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { useKeyboard, useKeyboardCommands } from "@/components/keyboard/keyboard-provider";
import { ProjectFilePasteController, isProjectPasteTarget } from "@/lib/project-file-paste";
import { ATTACHMENT_LIMIT_HINT } from "@/lib/attachment-limits";

export function ProjectFilePaste({ projectId, scope }: { projectId: string; scope: RefObject<HTMLDivElement | null> }) {
  const router = useRouter(); const { platform, bindings } = useKeyboard();
  const [error, setError] = useState(""); const [status, setStatus] = useState(""); const [pending, setPending] = useState(false);
  const [retryFiles, setRetryFiles] = useState<File[] | null>(null);
  const controller = useMemo(() => new ProjectFilePasteController({ platform, bindings: () => bindings("task.paste-file"), error: setError, upload: async files => {
    setPending(true); setError(""); setStatus(""); setRetryFiles(files);
    try {
      const body = new FormData(); body.set("projectId", projectId); files.forEach(file => body.append("files", file));
      const response = await fetch("/api/attachments", { method: "POST", body });
      const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Files could not save. Please retry.");
      setRetryFiles(null); setStatus(`${result.tasks.length} file ${result.tasks.length === 1 ? "task" : "tasks"} created.`); router.refresh();
    } finally { setPending(false); }
  } }), [platform, bindings, projectId, router]);
  useEffect(() => {
    const element = scope.current; if (!element) return;
    const paste = (event: ClipboardEvent) => { if (isProjectPasteTarget(event.target, element, document.body) && !document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]')) void controller.paste(event); };
    const start = () => { controller.composing = true; }; const end = () => { controller.composing = false; };
    document.addEventListener("paste", paste); document.addEventListener("compositionstart", start); document.addEventListener("compositionend", end);
    return () => { document.removeEventListener("paste", paste); document.removeEventListener("compositionstart", start); document.removeEventListener("compositionend", end); };
  }, [controller, scope]);
  useKeyboardCommands({ "task.paste-file": (event?: KeyboardEvent) => {
    if (!isProjectPasteTarget(document.activeElement, scope.current, document.body)) return false;
    if (event?.key.toLowerCase() === "v" && !event.shiftKey && !event.altKey && (platform === "mac" ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey)) return false;
    void controller.read(navigator.clipboard?.read ? () => navigator.clipboard.read() : undefined);
  } });
  return <div className="space-y-1 text-xs text-muted-foreground"><p>Paste files as tasks. {ATTACHMENT_LIMIT_HINT}</p>
    <p>Browsers may expose only images and omit original file names.</p>
    {pending && <p role="status">Saving files…</p>}{status && <p role="status">{status}</p>}
    {error && <p role="alert" className="text-destructive">{error} {retryFiles && <><span> Check the project before retrying if the connection was interrupted.</span> <button type="button" disabled={pending} className="underline" onClick={() => void controller.upload(retryFiles)}>Retry file paste</button></>}</p>}
  </div>;
}
