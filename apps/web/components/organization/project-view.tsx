"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ViewSwitcher } from "@/components/tasks/view-switcher";
import { TaskRow } from "@/components/tasks/task-row";
import { TaskComposer } from "@/components/tasks/task-composer";
import { useKeyboardCommands, ShortcutHint } from "@/components/keyboard/keyboard-provider";
import { createSection, deleteSection } from "@/app/(app)/projects/organization-actions";
import { updateProject, deleteProject } from "@/app/(app)/projects/actions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Task } from "@/lib/tasks";
import { useDisplaySettings } from "@/components/tasks/display-settings";

export function ProjectView({ project, sections, tasks }: { project: { id: string; name: string; color: string | null }; sections: { id: string; name: string }[]; tasks: Task[] }) {
  const scope = useRef<HTMLDivElement>(null); const router = useRouter();
  const { showCompleted } = useDisplaySettings();
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  useEffect(() => { const toggle = () => setCollapsedSections(current => current.size ? new Set() : new Set(sections.map(section => section.id))); window.addEventListener("todalo:toggle-sections", toggle); return () => window.removeEventListener("todalo:toggle-sections", toggle); }, [sections]);
  useEffect(() => { const reveal = (event: Event) => setCollapsedSections(current => { const next = new Set(current); next.delete((event as CustomEvent<string>).detail); return next; }); window.addEventListener("todalo:reveal-section", reveal); return () => window.removeEventListener("todalo:reveal-section", reveal); }, []);
  const [sort, setSort] = useState<"manual" | "date" | "name">("manual");
  const [sectionOpen, setSectionOpen] = useState(false); const [menuOpen, setMenuOpen] = useState(false);
  const [name, setName] = useState(""); const [projectName, setProjectName] = useState(project.name); const [error, setError] = useState(""); const [pending, startTransition] = useTransition();
  const sorted = tasks.filter(task => showCompleted || task.status !== "done").sort((a, b) => sort === "name" ? a.title.localeCompare(b.title) : sort === "date" ? (a.dueDate ? new Date(a.dueDate).getTime() : Infinity) - (b.dueDate ? new Date(b.dueDate).getTime() : Infinity) : a.sortOrder - b.sortOrder);
  useKeyboardCommands({ "project.section": () => setSectionOpen(true), "project.menu": () => setMenuOpen(true), "project.sort-date": () => setSort("date"), "project.sort-name": () => setSort("name") }, { scope });
  function run(action: () => Promise<unknown>) { startTransition(async () => { try { setError(""); await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save changes"); } }); }
  const groups = [{ id: null, name: "Tasks" }, ...sections];
  return <div ref={scope} tabIndex={-1} className="space-y-5 outline-none" data-project-id={project.id}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold">{project.name}</h1><div className="flex gap-2"><Button variant="outline" onClick={() => setSectionOpen(true)}>Add section <ShortcutHint commandId="project.section" /></Button><Button variant="outline" onClick={() => setMenuOpen(true)}>Project menu <ShortcutHint commandId="project.menu" /></Button></div></div>
    <div className="flex flex-wrap items-center gap-3"><label className="text-sm">Sort <select aria-label="Project sort" className="ml-2 rounded border p-1" value={sort} onChange={event => setSort(event.target.value as typeof sort)}><option value="manual">Manual</option><option value="date">Date</option><option value="name">Name</option></select></label><span className="text-xs text-muted-foreground">Date <ShortcutHint commandId="project.sort-date" /> · Name <ShortcutHint commandId="project.sort-name" /></span></div>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <ViewSwitcher projectId={project.id} tasks={sorted} listView={<div className="space-y-6">{groups.map(group => {
      const groupTasks = sorted.filter(task => task.sectionId === group.id);
      const tree = groupTasks.filter(task => !task.parentId || !groupTasks.some(parent => parent.id === task.parentId)).flatMap(parent => [parent, ...groupTasks.filter(child => child.parentId === parent.id)]);
      return <section key={group.id ?? "root"} id={group.id ? `section-${group.id}` : undefined} tabIndex={-1}><div className="flex items-center gap-3"><h2 className="mb-2 text-sm font-semibold">{group.id ? <button type="button" aria-expanded={!collapsedSections.has(group.id)} onClick={() => setCollapsedSections(current => { const next = new Set(current); if (!next.delete(group.id!)) next.add(group.id!); return next; })}>{collapsedSections.has(group.id) ? "▸" : "▾"} {group.name}</button> : group.name}</h2>{group.id && <button type="button" className="text-xs underline" disabled={pending} onClick={() => run(() => deleteSection(group.id!))}>Delete section</button>}</div><div hidden={Boolean(group.id && collapsedSections.has(group.id))}>{tree.map(task => <TaskRow key={task.id} task={task} />)}<TaskComposer projectId={project.id} sectionId={group.id} /></div></section>;
    })}</div>} />
    <Dialog open={sectionOpen} onOpenChange={setSectionOpen}><DialogContent><DialogHeader><DialogTitle>Create section</DialogTitle></DialogHeader><form className="space-y-3" onSubmit={event => { event.preventDefault(); run(async () => { await createSection(project.id, name); setSectionOpen(false); setName(""); }); }}><Input aria-label="Section name" value={name} onChange={event => setName(event.target.value)} required maxLength={200} /><Button disabled={pending || !name.trim()}>Create section</Button></form></DialogContent></Dialog>
    <Dialog open={menuOpen} onOpenChange={setMenuOpen}><DialogContent><DialogHeader><DialogTitle>Project menu</DialogTitle></DialogHeader><form className="space-y-3" onSubmit={event => { event.preventDefault(); run(async () => { await updateProject(project.id, { name: projectName }); setMenuOpen(false); }); }}><Input aria-label="Project name" value={projectName} onChange={event => setProjectName(event.target.value)} required maxLength={200} /><Button disabled={pending}>Save project name</Button></form><Button variant="destructive" disabled={pending} onClick={() => { if (window.confirm("Delete this project? Its tasks will move to Inbox.")) run(async () => { await deleteProject(project.id); router.push("/inbox"); }); }}>Delete project</Button></DialogContent></Dialog>
  </div>;
}
