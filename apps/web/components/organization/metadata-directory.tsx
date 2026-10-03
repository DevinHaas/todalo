"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { createLabel, updateLabel, deleteLabel, saveFilter, deleteFilter, type getMetadata } from "@/app/(app)/tasks/metadata-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShortcutHint } from "@/components/keyboard/keyboard-provider";
import { filterDefinitionSchema, type FilterDefinition } from "@/lib/task-metadata";

type Metadata = Awaited<ReturnType<typeof getMetadata>>;
const blankDefinition = () => filterDefinitionSchema.parse({});
export function MetadataDirectory({ metadata, mode }: { metadata: Metadata; mode: "labels" | "filters" }) {
  const [labelId, setLabelId] = useState<string | undefined>(); const [labelName, setLabelName] = useState(""); const [color, setColor] = useState("#808080");
  const [filterId, setFilterId] = useState<string | undefined>(); const [filterName, setFilterName] = useState(""); const [definition, setDefinition] = useState<FilterDefinition>(blankDefinition);
  const [error, setError] = useState(""); const [pending, startTransition] = useTransition();
  function run(action: () => Promise<unknown>) { startTransition(async () => { try { setError(""); await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save changes"); } }); }
  function resetLabel() { setLabelId(undefined); setLabelName(""); setColor("#808080"); }
  function resetFilter() { setFilterId(undefined); setFilterName(""); setDefinition(blankDefinition()); }
  return <div className="mx-auto max-w-3xl space-y-6">
    <h1 className="text-2xl font-semibold">{mode === "labels" ? "Labels" : "Filters & Labels"}</h1>
    <nav className="flex gap-5 text-sm"><Link href="/labels" className="underline">Labels <ShortcutHint commandId="navigation.labels" /></Link><Link href="/filters" className="underline">Filters & Labels <ShortcutHint commandId="navigation.filters" /></Link></nav>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <section className="space-y-3"><h2 className="font-semibold">Labels</h2>
      {metadata.labels.length ? metadata.labels.map(label => <div key={label.id} className="flex items-center gap-3 border-b py-2"><span className="size-3 rounded-full" style={{ backgroundColor: label.color ?? "#808080" }} /><Link href={`/labels/${label.id}`} className="flex-1 underline">{label.name}</Link><Button variant="ghost" size="sm" disabled={pending} onClick={() => { setLabelId(label.id); setLabelName(label.name); setColor(label.color ?? "#808080"); }}>Edit {label.name}</Button><Button variant="ghost" size="sm" disabled={pending} onClick={() => { if (window.confirm(`Delete label ${label.name}? Tasks are kept.`)) run(() => deleteLabel(label.id)); }}>Delete {label.name}</Button></div>) : <p className="text-sm text-muted-foreground">No labels yet.</p>}
      <form className="flex flex-wrap items-end gap-3 rounded border p-3" onSubmit={event => { event.preventDefault(); run(async () => { if (labelId) await updateLabel(labelId, { name: labelName, color }); else await createLabel({ name: labelName, color }); resetLabel(); }); }}><label className="flex-1 space-y-1"><span className="text-sm">Label name</span><Input aria-label="Label name" value={labelName} onChange={event => setLabelName(event.target.value)} required maxLength={100} /></label><label className="space-y-1"><span className="block text-sm">Color</span><input aria-label="Label color" type="color" value={color} onChange={event => setColor(event.target.value)} /></label><Button type="submit" disabled={pending || !labelName.trim()}>{labelId ? "Save label" : "Create label"}</Button>{labelId && <Button type="button" variant="ghost" onClick={resetLabel}>Cancel</Button>}</form>
    </section>
    {mode === "filters" && <section className="space-y-3"><h2 className="font-semibold">Saved filters</h2><p className="text-sm text-muted-foreground">All chosen conditions must match. Filters support priority, label, project, completion status, and due date.</p>
      {metadata.filters.map(filter => <div key={filter.id} className="flex items-center gap-3 border-b py-2"><Link href={`/filters/${filter.id}`} className="flex-1 underline">{filter.name}</Link><Button size="sm" variant="ghost" disabled={pending} onClick={() => { setFilterId(filter.id); setFilterName(filter.name); setDefinition(filter.definition); }}>Edit {filter.name}</Button><Button size="sm" variant="ghost" disabled={pending} onClick={() => { if (window.confirm(`Delete filter ${filter.name}?`)) run(() => deleteFilter(filter.id)); }}>Delete {filter.name}</Button></div>)}
      <form className="space-y-3 rounded border p-3" onSubmit={event => { event.preventDefault(); run(async () => { await saveFilter({ id: filterId, name: filterName, definition }); resetFilter(); }); }}>
        <label className="block space-y-1">Filter name<Input aria-label="Filter name" value={filterName} onChange={event => setFilterName(event.target.value)} required maxLength={100} /></label>
        <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1">Priority<select aria-label="Filter priority" className="block w-full rounded border bg-background p-2" value={definition.priority ?? ""} onChange={event => setDefinition({ ...definition, priority: event.target.value ? Number(event.target.value) : null })}><option value="">Any priority</option>{[1, 2, 3, 4].map(value => <option key={value} value={value}>Priority {value}</option>)}</select></label>
        <label className="space-y-1">Label<select aria-label="Filter label" className="block w-full rounded border bg-background p-2" value={definition.labelId ?? ""} onChange={event => setDefinition({ ...definition, labelId: event.target.value || null })}><option value="">Any label</option>{metadata.labels.map(label => <option key={label.id} value={label.id}>{label.name}</option>)}</select></label>
        <label className="space-y-1">Project<select aria-label="Filter project" className="block w-full rounded border bg-background p-2" value={definition.projectId ?? ""} onChange={event => setDefinition({ ...definition, projectId: event.target.value || null })}><option value="">Any project</option>{metadata.projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
        <label className="space-y-1">Status<select aria-label="Filter status" className="block w-full rounded border bg-background p-2" value={definition.status} onChange={event => setDefinition({ ...definition, status: event.target.value as FilterDefinition["status"] })}><option value="open">Open</option><option value="done">Completed</option><option value="any">Any</option></select></label>
        <label className="space-y-1">Due date<select aria-label="Filter due date" className="block w-full rounded border bg-background p-2" value={definition.due} onChange={event => setDefinition({ ...definition, due: event.target.value as FilterDefinition["due"] })}><option value="any">Any date</option><option value="today">Today</option><option value="overdue">Overdue</option><option value="undated">No due date</option></select></label></div>
        <Button type="submit" disabled={pending || !filterName.trim()}>{filterId ? "Save filter" : "Create filter"}</Button>{filterId && <Button type="button" variant="ghost" onClick={resetFilter}>Cancel</Button>}
      </form>
    </section>}
  </div>;
}
