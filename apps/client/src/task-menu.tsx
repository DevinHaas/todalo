// The right-click menu on tasks everywhere they are listed (rows, board cards,
// schedule blocks, the Plan sidebar): the task sheet's … actions on the
// task under the pointer. One menu wraps the page; any element with
// `data-task-id` opens it, elsewhere the browser's own menu shows. The keyboard
// keeps its own routes (task.menu, task.copy-url, task.unschedule, 1–4, …).
import { useState, type PointerEvent, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarMinus, CalendarPlus, CircleCheck, Flag, Link2, SquareArrowOutUpRight, Trash2 } from "lucide-react";
import { reads } from "./runtime";
import { useTaskWrites } from "./task-writes";
import { useBulkWrites } from "./bulk-screens";
import { copyTaskLink } from "./links";
import { inlineError } from "./toasts";
import { durationOf, isTimed, nextSlot, scheduledDetails, unscheduledDetails } from "./schedule";
import { operationId } from "./tasks";
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuRadioGroup, ContextMenuRadioItem, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent,
  ContextMenuSubTrigger, ContextMenuTrigger,
} from "./ui";

const priorityTone = { 1: "text-priority-1", 2: "text-priority-2", 3: "text-priority-3", 4: "text-priority-4" } as Record<number, string>;

export function TaskContextMenu({ userId, onOpen, children }: { userId: string; onOpen: (id: string) => void; children: ReactNode }) {
  // The task under the last pointer press inside the page; the menu is disabled elsewhere.
  const [id, setId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const tasks = useQuery(reads.today(userId)).data?.tasks;
  const task = id ? tasks?.find(item => item.id === id) : undefined;
  const writes = useTaskWrites(userId);
  const metadata = useMutation(useBulkWrites(userId).metadata);
  const pick = (event: PointerEvent<HTMLDivElement>) => {
    // Presses in the (portalled) menu bubble here through React: they keep the task.
    if (!event.currentTarget.contains(event.target as Node)) return;
    setId((event.target as Element).closest?.<HTMLElement>("[data-task-id]")?.dataset.taskId ?? null);
  };
  // Writes are toasted on failure (toasts.ts); only the clipboard copy reports here.
  const run = (write: Promise<unknown>) => { setNotice(null); write.catch((reason: unknown) => setNotice(inlineError(reason))); };
  const update = (details: Parameters<typeof writes.update.mutateAsync>[0]["details"]) => task && run(writes.update.mutateAsync({ id: task.id, details }));
  return <div className="contents" onPointerDownCapture={pick}>
    {notice && <p role="alert" className="form-error">{notice}</p>}
    <ContextMenu disabled={!task}>
      <ContextMenuTrigger className="contents select-auto">{children}</ContextMenuTrigger>
      {task && <ContextMenuContent className="ui min-w-48" aria-label={`Actions for ${task.title}`} data-task-menu="">
        <ContextMenuItem onClick={() => onOpen(task.id)}><SquareArrowOutUpRight />Open</ContextMenuItem>
        <ContextMenuItem onClick={() => run(copyTaskLink(task.id))}><Link2 />Copy link</ContextMenuItem>
        <ContextMenuSeparator />
        {isTimed(task)
          ? <ContextMenuItem onClick={() => update(unscheduledDetails(task))}><CalendarMinus />Unschedule</ContextMenuItem>
          : <ContextMenuItem onClick={() => { const { start, end } = nextSlot(durationOf(task)); update(scheduledDetails(task, start, end)); }}><CalendarPlus />Schedule next quarter hour</ContextMenuItem>}
        <ContextMenuSub>
          <ContextMenuSubTrigger><Flag className={priorityTone[task.priority]} />Priority</ContextMenuSubTrigger>
          <ContextMenuSubContent className="ui">
            <ContextMenuRadioGroup value={task.priority} onValueChange={(value) => run(metadata.mutateAsync({ tasks: [task], change: { priority: value as number } }))}>
              {[1, 2, 3, 4].map(priority => <ContextMenuRadioItem key={priority} value={priority}><Flag className={priorityTone[priority]} />Priority {priority}</ContextMenuRadioItem>)}
            </ContextMenuRadioGroup>
          </ContextMenuSubContent>
        </ContextMenuSub>
        {task.status !== "done" && <ContextMenuItem onClick={() => writes.complete.mutate({ task, operationId: operationId() })}><CircleCheck />Complete</ContextMenuItem>}
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onClick={() => writes.remove.mutate(task)}><Trash2 />Delete task</ContextMenuItem>
      </ContextMenuContent>}
    </ContextMenu>
  </div>;
}
