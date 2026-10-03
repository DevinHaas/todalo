"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTaskKeyboard } from "@/components/tasks/task-keyboard-provider";
import { useKeyboardCommands, ShortcutHint } from "@/components/keyboard/keyboard-provider";
import { getOrganizationDestinations, moveTasks, setTaskParent } from "@/app/(app)/projects/organization-actions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Task } from "@/lib/tasks";

export function OrganizationTaskActions({ tasks }: { tasks: Task[] }) {
  const keyboard = useTaskKeyboard(); const router = useRouter();
  const keyboardRef = useRef(keyboard);
  useEffect(() => { keyboardRef.current = keyboard; }, [keyboard]);
  useEffect(() => {
    const reveal = () => {
      if (!window.location.hash.startsWith("#task-")) return;
      const id = window.location.hash.slice(6); const target = tasks.find(task => task.id === id);
      if (target?.sectionId) window.dispatchEvent(new CustomEvent("todalo:reveal-section", { detail: target.sectionId }));
      if (target?.parentId && keyboardRef.current?.collapsedIds.has(target.parentId)) keyboardRef.current.toggleChildren(target.parentId);
      requestAnimationFrame(() => {
        const row = [...(keyboardRef.current?.root.current?.querySelectorAll<HTMLElement>("[data-task-id]") ?? [])].find(element => element.dataset.taskId === id);
        row?.scrollIntoView({ block: "center" }); row?.focus();
      });
    };
    reveal(); window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, [tasks]);
  const [open, setOpen] = useState(false); const [error, setError] = useState(""); const [pending, startTransition] = useTransition();
  const [destinations, setDestinations] = useState<Awaited<ReturnType<typeof getOrganizationDestinations>> | null>(null);
  const [projectId, setProjectId] = useState(""); const [sectionId, setSectionId] = useState("");
  const focused = tasks.find(task => task.id === keyboard?.focusedId);
  function run(action: () => Promise<unknown>) { startTransition(async () => { try { setError(""); await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not organize task"); } }); }
  function showMove() { if (!focused) return false; setProjectId(focused.projectId ?? ""); setSectionId(focused.sectionId ?? ""); setDestinations(null); setOpen(true); run(async () => { setDestinations(await getOrganizationDestinations()); }); }
  function nest() {
    if (!focused || !keyboard) return false;
    const rows = [...(keyboard.root.current?.querySelectorAll<HTMLElement>("[data-task-id]") ?? [])].filter(row => !row.hidden && !row.closest("[hidden]"));
    const previous = rows[rows.findIndex(row => row.dataset.taskId === focused.id) - 1];
    const parent = tasks.find(task => task.id === previous?.dataset.taskId);
    if (!parent) { setError("Choose a task below the task you want to nest under."); return; }
    run(() => setTaskParent(focused.id, parent.parentId ?? parent.id));
  }
  useKeyboardCommands({
    "task.move": showMove,
    "task.reveal": () => { if (!focused) return false; router.push(`${focused.projectId ? `/projects/${focused.projectId}` : "/inbox"}#task-${focused.id}`); },
    "task.nest": nest,
    "task.unnest": () => { if (!focused) return false; run(() => setTaskParent(focused.id, null)); },
    "task.toggle-children": () => { if (!focused || !keyboard) return false; keyboard.toggleChildren(focused.id); },
  }, { scope: keyboard?.root, enabled: Boolean(focused) });
  useKeyboardCommands({ "view.toggle-nested": () => { keyboard?.toggleAllChildren(); window.dispatchEvent(new Event("todalo:toggle-sections")); } }, { scope: keyboard?.root, enabled: Boolean(keyboard) });
  return <>
    {error && <p role="alert" className="rounded border p-2 text-sm text-destructive">{error}</p>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Move task <ShortcutHint commandId="task.move" /></DialogTitle></DialogHeader>
      {error && <div role="alert" className="text-destructive">{error} {!destinations && <button type="button" className="underline" onClick={() => run(async () => { setDestinations(await getOrganizationDestinations()); })}>Retry</button>}</div>}
      {!destinations ? <p role="status">{pending ? "Loading destinations…" : "Choose Retry to reload destinations."}</p> : <form className="space-y-4" onSubmit={event => { event.preventDefault(); if (!focused) return; const ids = keyboard?.selectedIds.size ? [...keyboard.selectedIds] : [focused.id]; run(async () => { await moveTasks(ids, { projectId: projectId || null, sectionId: sectionId || null }); setOpen(false); }); }}>
        <label className="block space-y-1"><span>Project</span><select aria-label="Move to project" className="w-full rounded border bg-background p-2" value={projectId} onChange={event => { setProjectId(event.target.value); setSectionId(""); }}><option value="">Inbox</option>{destinations.projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
        {projectId && <label className="block space-y-1"><span>Section</span><select aria-label="Move to section" className="w-full rounded border bg-background p-2" value={sectionId} onChange={event => setSectionId(event.target.value)}><option value="">No section</option>{destinations.sections.filter(section => section.projectId === projectId).map(section => <option key={section.id} value={section.id}>{section.name}</option>)}</select></label>}
        <Button disabled={pending}>Move task{keyboard && keyboard.selectedIds.size > 1 ? "s" : ""}</Button>
      </form>}
    </DialogContent></Dialog>
  </>;
}
