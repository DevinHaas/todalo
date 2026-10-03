"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { createProject } from "@/app/(app)/projects/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ProjectDirectory({ projects }: { projects: { id: string; name: string; color: string | null }[] }) {
  const [name, setName] = useState(""); const [error, setError] = useState(""); const [pending, startTransition] = useTransition();
  return <div className="max-w-3xl space-y-6">
    <form className="flex gap-2" onSubmit={event => { event.preventDefault(); startTransition(async () => { try { setError(""); await createProject({ name }); setName(""); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create project"); } }); }}>
      <Input aria-label="New project name" placeholder="New project name" value={name} onChange={event => setName(event.target.value)} required maxLength={200} />
      <Button disabled={pending || !name.trim()}>Create project</Button>
    </form>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <ul className="divide-y rounded border">{projects.map(project => <li key={project.id}><Link className="block p-4 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring" href={`/projects/${project.id}`}>{project.name}</Link></li>)}</ul>
    {!projects.length && <p className="text-muted-foreground">Create a project to organize your tasks.</p>}
  </div>;
}
