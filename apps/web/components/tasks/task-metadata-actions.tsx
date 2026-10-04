"use client";

import { useRef, useState, useTransition } from "react";
import { useTaskKeyboard } from "./task-keyboard-provider";
import { useKeyboardCommands } from "@/components/keyboard/keyboard-provider";
import { bulkTaskMetadata, getTaskEditorData } from "@/app/(app)/tasks/metadata-actions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TaskMetadataFields, useMetadataOptions, dateInputValue, dateInputDate } from "./task-metadata-fields";
import { copyTaskUrl } from "@/lib/task-url";

export function TaskMetadataActions({ toolbar = false }: { toolbar?: boolean }) {
  const keyboard = useTaskKeyboard(); const scope = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [dialog, setDialog] = useState<{ field: "priority" | "labels" | "deadline"; ids: string[] } | null>(null);
  const [priority, setPriority] = useState(4); const [deadline, setDeadline] = useState(""); const [labelIds, setLabelIds] = useState<string[]>([]);
  const [error, setError] = useState(""); const [message, setMessage] = useState(""); const [pending, startTransition] = useTransition();
  const loading = useMetadataOptions(Boolean(dialog));
  function activeTask() { return keyboard?.resolveTargets().task; }
  function targets() { return keyboard?.resolveTargets().ids ?? []; }
  function run(action: () => Promise<unknown>) { startTransition(async () => { try { setError(""); setMessage(""); await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Task metadata could not save"); } }); }
  function close() { setDialog(null); requestAnimationFrame(() => opener.current?.isConnected && opener.current.focus()); }
  function show(field: "priority" | "labels" | "deadline") {
    const ids = targets(); if (!ids.length) return false;
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    run(async () => {
      const task = await getTaskEditorData(ids[0]);
      setPriority(task.priority); setDeadline(dateInputValue(task.deadline)); setLabelIds(task.labelIds);
      setDialog({ field, ids });
    });
  }
  useKeyboardCommands({
    ...Object.fromEntries([1, 2, 3, 4].map(value => [`task.priority-${value}`, () => { const ids = targets(); if (!ids.length) return false; run(() => bulkTaskMetadata({ ids, priority: value })); }])),
    "task.priority": () => show("priority"), "task.labels": () => show("labels"), "task.deadline": () => show("deadline"),
    "task.clear-deadline": () => { const ids = targets(); if (!ids.length) return false; run(() => bulkTaskMetadata({ ids, deadline: null })); },
    "task.copy-url": () => { const task = activeTask(); if (!task) return false; run(async () => { await copyTaskUrl(task.id); setMessage("Task link copied."); }); },
  }, { scope: keyboard?.root, enabled: Boolean(keyboard) && !dialog && !toolbar });
  useKeyboardCommands({ "editor.save": () => save(), "general.dismiss": close }, { scope, enabled: Boolean(dialog), allowInEditor: true, allowInModal: true });
  function save() {
    if (!dialog || pending || !loading.options || loading.error) return false;
    // A bulk picker updates only its selected field, preserving other metadata.
    const data = dialog.field === "priority" ? { priority } : dialog.field === "labels" ? { labelIds } : { deadline: dateInputDate(deadline) };
    run(async () => { await bulkTaskMetadata({ ids: dialog.ids, ...data }); close(); });
  }
  return <>
    {toolbar && <><Button size="sm" variant="outline" disabled={pending} onClick={() => show("priority")}>Priority</Button><Button size="sm" variant="outline" disabled={pending} onClick={() => show("labels")}>Labels</Button><Button size="sm" variant="outline" disabled={pending} onClick={() => show("deadline")}>Deadline</Button></>}
    {error && !dialog && <p role="alert" className="text-sm text-destructive">{error}</p>}{message && <p role="status" className="text-sm">{message}</p>}
    <Dialog open={Boolean(dialog)} onOpenChange={open => { if (!open) close(); }}><DialogContent ref={scope}><DialogHeader><DialogTitle>{dialog?.field === "priority" ? "Choose priority" : dialog?.field === "labels" ? "Edit labels" : "Choose deadline"}{dialog && dialog.ids.length > 1 ? ` for ${dialog.ids.length} tasks` : ""}</DialogTitle></DialogHeader>
      {(error || loading.error) && <p role="alert" className="text-destructive">{error || loading.error} {loading.error && <button type="button" className="underline" onClick={loading.reload}>Retry</button>}</p>}
      {loading.options ? <form className="space-y-4" onSubmit={event => { event.preventDefault(); save(); }}><TaskMetadataFields priority={priority} onPriority={setPriority} deadline={deadline} onDeadline={setDeadline} labelIds={labelIds} onLabels={setLabelIds} labels={loading.options.labels} focusField={dialog?.field} onlyField={dialog?.field} disabled={pending} />{dialog?.field === "labels" && dialog.ids.length > 1 && <p className="text-sm text-muted-foreground">These labels replace the labels on every selected task.</p>}<Button type="submit" disabled={pending || Boolean(loading.error)}>Save</Button></form> : <p role="status">Loading labels…</p>}
    </DialogContent></Dialog>
  </>;
}
