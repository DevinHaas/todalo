"use client";

import { useOptimistic, useTransition } from "react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { reorderTask } from "@/app/(app)/tasks/actions";
import { TaskEditDialog } from "@/components/tasks/task-edit-dialog";
import type { Task } from "@/lib/tasks";
import { useTaskKeyboard } from "./task-keyboard-provider";
import { taskTreeOrder } from "@/lib/task-keyboard";

const COLUMNS = [
  { status: "todo", label: "To do" },
  { status: "in_progress", label: "In progress" },
  { status: "done", label: "Done" },
] as const;

function BoardColumn({
  status,
  children,
}: {
  status: Task["status"];
  children: React.ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id: status });
  return (
    <div ref={setNodeRef} className="min-h-16">
      {children}
    </div>
  );
}

function BoardCard({ task }: { task: Task }) {
  const keyboard = useTaskKeyboard();
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: task.id,
  });

  return (
    <>
    {keyboard?.creationSlot(task.id, "above")}
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      data-task-id={task.id}
      tabIndex={0}
      aria-label={task.title}
      hidden={Boolean(task.parentId && keyboard?.collapsedIds.has(task.parentId))}
      onFocus={() => keyboard?.focus(task.id)}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`mb-2 cursor-grab rounded-md border bg-card p-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing ${keyboard?.selectedIds.has(task.id) ? "ring-2 ring-primary" : ""} ${task.parentId ? "ml-4" : ""}`}
    >
      {keyboard ? <button type="button" className="w-full text-left" onClick={() => keyboard.open(task)}>{task.title}</button> : <TaskEditDialog task={task}>
        <button type="button" className="w-full text-left">
          {task.title}
        </button>
      </TaskEditDialog>}
    </div>
    {keyboard?.creationSlot(task.id, "below")}
    </>
  );
}

export function BoardView({ tasks }: { tasks: Task[] }) {
  const [optimisticTasks, applyOptimistic] = useOptimistic(
    tasks,
    (state, { id, status }: { id: string; status: Task["status"] }) =>
      state.map((t) => (t.id === id ? { ...t, status } : t)),
  );
  const [, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const task = optimisticTasks.find((t) => t.id === active.id);
    if (!task) return;

    const overTask = optimisticTasks.find((t) => t.id === over.id);
    const newStatus = overTask ? overTask.status : (over.id as Task["status"]);
    if (newStatus === task.status) return;

    const columnTasks = optimisticTasks.filter((t) => t.status === newStatus);
    const newSortOrder = columnTasks.length;

    startTransition(() => {
      applyOptimistic({ id: task.id, status: newStatus });
      reorderTask(task.id, newStatus, newSortOrder);
    });
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-3 gap-4">
        {COLUMNS.map((column) => {
          const columnTasks = optimisticTasks.filter((t) => t.status === column.status);
          return (
            <div key={column.status} data-task-column={column.status} className="rounded-lg border p-3">
              <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                {column.label}
              </h2>
              <SortableContext
                items={columnTasks.map((t) => t.id)}
                strategy={verticalListSortingStrategy}
              >
                <BoardColumn status={column.status}>
                  {taskTreeOrder(columnTasks).map((task) => (
                    <BoardCard key={task.id} task={task} />
                  ))}
                </BoardColumn>
              </SortableContext>
            </div>
          );
        })}
      </div>
    </DndContext>
  );
}
