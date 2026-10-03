"use client";
import { useState } from "react";
import Link from "next/link";
import { TaskEditDialog } from "./task-edit-dialog";
import { Button } from "@/components/ui/button";
import type { Task } from "@/lib/tasks";
import { useTaskDateLabel } from "./use-task-date-label";
export function TaskDetailPage({ task }: { task: Task }) {
  const [open, setOpen] = useState(true);
  const deadlineLabel = useTaskDateLabel(task.deadline);
  return <div className="mx-auto max-w-2xl space-y-4"><h1 className="text-2xl font-semibold">{task.title}</h1>{task.status === "done" && <p>Completed task</p>}<p className="whitespace-pre-wrap">{task.description}</p><p>Priority {task.priority}{task.deadline ? ` · Deadline ${deadlineLabel}` : ""}</p><Button onClick={() => setOpen(true)}>Edit task details</Button><Link className="ml-4 underline" href={task.projectId ? `/projects/${task.projectId}` : "/inbox"}>Open task collection</Link><TaskEditDialog key={task.updatedAt?.toString()} task={task} open={open} onOpenChange={setOpen} /></div>;
}
