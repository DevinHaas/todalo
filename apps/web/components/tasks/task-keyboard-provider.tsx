"use client";

import { createContext, useContext, useRef, useState, useTransition, type RefObject } from "react";
import { usePathname } from "next/navigation";
import { TaskFocusController } from "@/lib/task-keyboard";
import type { Task } from "@/lib/tasks";
import { useKeyboardCommands, ShortcutHint } from "@/components/keyboard/keyboard-provider";
import { bulkTaskAction } from "@/app/(app)/tasks/actions";
import { TaskEditDialog } from "./task-edit-dialog";
import { TaskComposer } from "./task-composer";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OrganizationTaskActions } from "@/components/organization/organization-task-actions";
import { TaskMetadataActions } from "./task-metadata-actions";

type Edge = "top" | "bottom" | "above" | "below";
type Mode = "details" | "inline" | "date" | "menu";
type TaskAction = "complete" | "delete" | "clear-date";
interface TaskKeyboardContextValue {
  focusedId: string | null; selectedIds: Set<string>; root: RefObject<HTMLDivElement | null>;
  focus(id: string): void; open(task: Task, mode?: Mode): void;
  mutate(action: TaskAction, ids?: string[]): void; insert(edge: Edge, anchor?: Task): void;
  collapsedIds: Set<string>; toggleChildren(id: string): void; toggleAllChildren(): void;
  creationSlot(id: string, edge: "above" | "below"): React.ReactNode;
}
const TaskKeyboardContext = createContext<TaskKeyboardContextValue | null>(null);
export function useTaskKeyboard() { return useContext(TaskKeyboardContext); }

export function TaskKeyboardProvider({ tasks, children, projectId }: { tasks: Task[]; children: React.ReactNode; projectId?: string }) {
  const pathname = usePathname();
  const root = useRef<HTMLDivElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const [controller] = useState(() => ({ current: new TaskFocusController() }));
  const [revision, refresh] = useState(0);
  const [editor, setEditor] = useState<{ task: Task; mode: Mode } | null>(null);
  const [creation, setCreation] = useState<{ edge: Edge; anchor?: Task } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [collapsedIds, setCollapsedIds] = useState(new Set<string>());
  function toggleChildren(id: string) { setCollapsedIds(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  function toggleAllChildren() { setCollapsedIds(previous => previous.size ? new Set() : new Set(tasks.filter(task => tasks.some(child => child.parentId === task.id)).map(task => task.id))); }
  const [pending, startTransition] = useTransition();
  const working = useRef(false);
  const opener = useRef<HTMLElement | null>(null);
  function syncVisible() {
    controller.current.setVisible(Array.from(root.current?.querySelectorAll<HTMLElement>('[data-task-id]') ?? []).filter(element => !element.hidden && !element.closest('[hidden]')).map(element => element.dataset.taskId!));
  }
  function focus(id: string) { syncVisible(); controller.current.focus(id); refresh(value => value + 1); }
  function focusElement(id: string | null) {
    const element = Array.from(root.current?.querySelectorAll<HTMLElement>('[data-task-id]') ?? []).find(element => element.dataset.taskId === id);
    (element ?? root.current)?.focus();
  }
  function move(direction: number) { syncVisible(); const id = controller.current.move(direction); refresh(value => value + 1); focusElement(id); return Boolean(id); }
  function moveHorizontal(direction: number) {
    syncVisible();
    const columns = Array.from(root.current?.querySelectorAll<HTMLElement>('[data-task-column]') ?? []).map(column => Array.from(column.querySelectorAll<HTMLElement>('[data-task-id]')).map(element => element.dataset.taskId!).filter(id => controller.current.visible.includes(id)));
    if (!columns.length) return move(direction);
    const id = controller.current.moveColumn(columns, direction); refresh(value => value + 1); focusElement(id); return Boolean(id);
  }
  function focusedTask() {
    syncVisible();
    const active = document.activeElement instanceof HTMLElement ? document.activeElement.closest<HTMLElement>('[data-task-id]') : null;
    if (!active || !root.current?.contains(active)) return undefined;
    return tasks.find(task => task.id === active.dataset.taskId);
  }
  function restore() { requestAnimationFrame(() => { if (opener.current?.isConnected) opener.current.focus(); else focusElement(controller.current.focused); }); }
  function open(task: Task, mode: Mode = "details") { opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; focus(task.id); setEditor({ task, mode }); }
  function insert(edge: Edge, anchor?: Task) { opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setCreation({ edge, anchor }); }
  function mutate(action: TaskAction, explicit?: string[]) {
    syncVisible();
    if (!explicit && !controller.current.selected.size && !focusedTask()) return false;
    const ids = explicit ?? controller.current.targets();
    if (!ids.length || working.current) return false;
    working.current = true; setError(null);
    startTransition(async () => {
      try {
        await bulkTaskAction({ ids, action });
        if (action !== "clear-date") controller.current.remove(ids);
        refresh(value => value + 1); requestAnimationFrame(() => { syncVisible(); refresh(value => value + 1); focusElement(controller.current.focused); });
      } catch (reason) { setError(reason instanceof Error ? reason.message : "Task action failed. Please retry."); }
      finally { working.current = false; }
    });
  }
  function show(mode: Mode) { const task = focusedTask(); if (!task) return false; open(task, mode); }
  function navigateEditor(direction: number) {
    syncVisible(); const id = controller.current.move(direction); const task = tasks.find(task => task.id === id);
    refresh(value => value + 1); if (task) setEditor({ task, mode: editor?.mode === "inline" ? "inline" : "details" });
  }
  useKeyboardCommands({
    "task.previous": () => move(-1), "task.next": () => move(1),
    "task.left": () => moveHorizontal(-1), "task.right": () => moveHorizontal(1),
    "view.first": () => move(-Infinity), "view.last": () => move(Infinity),
    "task.select": () => { if (!focusedTask()) return false; controller.current.toggleSelection(); refresh(value => value + 1); },
    "task.toolbar": () => { if (!controller.current.selected.size) return false; toolbar.current?.querySelector<HTMLButtonElement>('button')?.focus(); },
    "task.complete": () => mutate("complete"), "task.delete": () => mutate("delete"), "task.clear-date": () => mutate("clear-date"),
    "task.details": () => show("details"), "task.edit": () => show("inline"), "task.date": () => show("date"), "task.menu": () => show("menu"),
    "task.add-top": () => insert("top"), "task.add-bottom": () => insert("bottom"),
  }, { enabled: !editor && !creation });
  const state = controller.current;
  // Revision observes the mutable controller while its methods remain a single public seam.
  void revision;
  const composer = creation && <TaskComposer key={`${creation.edge}-${creation.anchor?.id ?? "list"}`} openInline sectionId={creation.anchor?.sectionId} projectId={creation.anchor?.projectId ?? projectId} initialDueDate={creation.anchor?.dueDate ? new Date(creation.anchor.dueDate) : undefined} defaultToToday={pathname === "/today" || pathname === "/upcoming"} placement={{ edge: creation.edge, anchorId: creation.anchor?.id }} onOpenChange={open => { if (!open) { setCreation(null); restore(); } }} onCreated={(id, direction) => { if (direction) setCreation({ edge: direction, anchor: { ...creation.anchor, id, projectId: creation.anchor?.projectId ?? projectId ?? null } as Task }); else { setCreation(null); restore(); } }} />;
  function creationSlot(id: string, edge: "above" | "below") { return creation?.anchor?.id === id && creation.edge === edge ? composer : null; }
  return <TaskKeyboardContext.Provider value={{ focusedId: state.focused, selectedIds: state.selected, focus, open, mutate, insert, root, collapsedIds, toggleChildren, toggleAllChildren, creationSlot }}>
    <div ref={root} tabIndex={-1} aria-label="Task collection" className="outline-none">
      <OrganizationTaskActions tasks={tasks} />
      <TaskMetadataActions tasks={tasks} />
      {error && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
      {state.selected.size > 0 && <div ref={toolbar} role="toolbar" aria-label="Selected task actions" className="mb-3 flex flex-wrap items-center gap-2 rounded border bg-muted p-2">
        <span className="text-sm">{state.selected.size} selected</span>
        <Button size="sm" disabled={pending} onClick={() => mutate("complete")}>Complete <ShortcutHint commandId="task.complete" /></Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => mutate("delete")}>Delete <ShortcutHint commandId="task.delete" /></Button>
        <TaskMetadataActions tasks={tasks} toolbar />
        <Button size="sm" variant="ghost" onClick={() => { state.selected.clear(); refresh(value => value + 1); focusElement(state.focused); }}>Clear selection</Button>
      </div>}
      {creation?.edge === "top" ? composer : null}
      {children}
      {creation?.edge === "bottom" ? composer : null}
    </div>
    {editor && editor.mode !== "menu" && <TaskEditDialog key={editor.task.id} task={editor.task} variant={editor.mode === "inline" ? "inline" : "details"} open onOpenChange={open => { if (!open) { setEditor(null); restore(); } }} initialDateOpen={editor.mode === "date"} onNavigate={navigateEditor} onInsert={edge => { const task = editor.task; setEditor(null); insert(edge, task); }} />}
    <Dialog open={editor?.mode === "menu"} onOpenChange={open => { if (!open) { setEditor(null); restore(); } }}>
      <DialogContent><DialogHeader><DialogTitle>Task actions</DialogTitle></DialogHeader>
        <Button variant="outline" onClick={() => setEditor(editor && { ...editor, mode: "inline" })}>Edit <ShortcutHint commandId="task.edit" /></Button>
        <Button variant="outline" onClick={() => setEditor(editor && { ...editor, mode: "date" })}>Choose date <ShortcutHint commandId="task.date" /></Button>
        <Button variant="outline" onClick={() => { if (editor) mutate("clear-date", [editor.task.id]); setEditor(null); restore(); }}>Clear date <ShortcutHint commandId="task.clear-date" /></Button>
        <Button variant="outline" onClick={() => { if (editor) mutate("complete", [editor.task.id]); setEditor(null); }}>Complete <ShortcutHint commandId="task.complete" /></Button>
        <Button variant="outline" onClick={() => { if (editor) mutate("delete", [editor.task.id]); setEditor(null); }}>Delete <ShortcutHint commandId="task.delete" /></Button>
      </DialogContent>
    </Dialog>
  </TaskKeyboardContext.Provider>;
}
