"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useKeyboard, useKeyboardCommands, ShortcutHint } from "@/components/keyboard/keyboard-provider";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateTask } from "@/app/(app)/tasks/actions";
import { combineDateAndTime, hasDueTime } from "@/lib/task-dates";
import { TimeRangeInputs } from "@/components/tasks/time-range-inputs";
import type { Task } from "@/lib/tasks";
import type { Recurrence } from "@/lib/recurrence";
import { TaskMetadataFields, useMetadataOptions, dateInputValue, dateInputDate } from "./task-metadata-fields";
import { copyTaskUrl } from "@/lib/task-url";
import { TaskAttachments } from "./task-attachments";
import { getTaskEditorData } from "@/app/(app)/tasks/metadata-actions";
import { useTaskDateLabel } from "./use-task-date-label";

function formatTime(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

const RECURRENCE_OPTIONS: { value: string; recurrence: Recurrence | null }[] = [
  { value: "none", recurrence: null },
  { value: "daily", recurrence: { n: 1, unit: "day", basedOn: "scheduled" } },
  { value: "weekly", recurrence: { n: 1, unit: "week", basedOn: "scheduled" } },
  { value: "monthly", recurrence: { n: 1, unit: "month", basedOn: "scheduled" } },
];

function recurrenceOptionValue(recurrence: Recurrence | null | undefined): string {
  const match = RECURRENCE_OPTIONS.find(
    (o) => o.recurrence && o.recurrence.n === recurrence?.n && o.recurrence.unit === recurrence?.unit,
  );
  return match?.value ?? "none";
}

export function TaskEditDialog({
  task,
  children,
  open: controlledOpen,
  onOpenChange,
  initialDateOpen = false,
  onNavigate,
  onInsert,
  variant = "details",
}: {
  task: Task;
  children?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  initialDateOpen?: boolean;
  onNavigate?: (direction: number) => void;
  onInsert?: (edge: "above" | "below") => void;
  variant?: "details" | "inline";
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  function setOpen(value: boolean) { if (!value) setFreshFor(null); setInternalOpen(value); onOpenChange?.(value); }
  const scope = useRef<HTMLDivElement>(null);
  const { platform } = useKeyboard();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [priority, setPriority] = useState(task.priority);
  const [deadline, setDeadline] = useState(dateInputValue(task.deadline));
  const [labelIds, setLabelIds] = useState(task.labelIds);
  const metadata = useMetadataOptions(open);
  const [copied, setCopied] = useState(false);
  const [dateOpen, setDateOpen] = useState(initialDateOpen);
  const [error, setError] = useState<string | null>(null);
  const saving = useRef(false);
  const [dueDate, setDueDate] = useState<Date | undefined>(
    task.dueDate ? new Date(task.dueDate) : undefined,
  );
  const [startTime, setStartTime] = useState(
    task.dueDate && hasDueTime(new Date(task.dueDate)) ? formatTime(new Date(task.dueDate)) : "",
  );
  const [endTime, setEndTime] = useState(
    task.dueDateEnd ? formatTime(new Date(task.dueDateEnd)) : "",
  );
  const [recurrenceValue, setRecurrenceValue] = useState(
    recurrenceOptionValue(task.recurrence),
  );
  const [isPending, startTransition] = useTransition();
  const dueDateLabel = useTaskDateLabel(dueDate);
  const [freshFor, setFreshFor] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getTaskEditorData(task.id).then(fresh => {
      if (cancelled) return;
      setTitle(fresh.title); setDescription(fresh.description ?? ""); setPriority(fresh.priority); setDeadline(dateInputValue(fresh.deadline)); setLabelIds(fresh.labelIds);
      setDueDate(fresh.dueDate ? new Date(fresh.dueDate) : undefined);
      setStartTime(fresh.dueDate && hasDueTime(new Date(fresh.dueDate)) ? formatTime(new Date(fresh.dueDate)) : "");
      setEndTime(fresh.dueDateEnd ? formatTime(new Date(fresh.dueDateEnd)) : ""); setRecurrenceValue(recurrenceOptionValue(fresh.recurrence)); setFreshFor(task.id);
    }).catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Task could not load. Close and reopen to retry."); });
    return () => { cancelled = true; };
  }, [open, task.id]);

  function save(after?: "above" | "below", direction?: number) {
    if (saving.current || freshFor !== task.id || !title.trim()) return false;
    saving.current = true; setError(null);
    const recurrence =
      RECURRENCE_OPTIONS.find((o) => o.value === recurrenceValue)?.recurrence ??
      null;
    const finalDueDate = dueDate && startTime ? combineDateAndTime(dueDate, startTime) : dueDate;
    const dueDateEnd = dueDate && endTime ? combineDateAndTime(dueDate, endTime) : null;
    startTransition(async () => {
      try { await updateTask({
        id: task.id,
        title: title.trim(), description,
        priority, deadline: dateInputDate(deadline), labelIds,
        dueDate: finalDueDate ?? null,
        dueDateEnd,
        recurrence,
      });
      if (direction !== undefined) onNavigate?.(direction);
      else if (after) onInsert?.(after);
      else setOpen(false);
      } catch (reason) { setError(reason instanceof Error ? reason.message : "Task could not save. Please retry."); }
      finally { saving.current = false; }
    });
  }
  useKeyboardCommands({
    "general.dismiss": () => { if (dateOpen) return false; setOpen(false); },
    ...(variant === "details" || platform === "mac" ? { "editor.save": () => save() } : {}),
    ...(variant === "inline" && onInsert ? { "editor.save-below": () => save("below"), "editor.save-above": () => save("above") } : {}),
    ...(onNavigate ? { "editor.previous": () => save(undefined, -1), "editor.next": () => save(undefined, 1) } : {}),
  }, { enabled: open, scope, allowInEditor: true, allowInModal: true });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {children && <DialogTrigger render={children as React.ReactElement} />}
      <DialogContent ref={scope} className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{task.title}</DialogTitle>
        </DialogHeader>
        {freshFor !== task.id ? <p role={error ? "alert" : "status"}>{error ?? "Loading current task…"}</p> : <fieldset disabled={isPending} className="space-y-4">
          {error && <p role="alert" className="text-destructive">{error}</p>}
          <label className="block space-y-1">Task name<Input autoFocus value={title} onChange={event => setTitle(event.target.value)} /></label>
          <label className="block space-y-1">Description<textarea className="min-h-20 w-full rounded border p-2" value={description} onChange={event => setDescription(event.target.value)} /></label>
          {metadata.error && <p role="alert" className="text-destructive">{metadata.error} <button type="button" className="underline" onClick={metadata.reload}>Retry</button></p>}
          <TaskMetadataFields priority={priority} onPriority={setPriority} deadline={deadline} onDeadline={setDeadline} labelIds={labelIds} onLabels={setLabelIds} labels={metadata.options?.labels ?? []} disabled={isPending} />
          <div className="flex flex-wrap gap-3 text-sm"><a href={`/tasks/${encodeURIComponent(task.id)}`} className="underline">Task link</a><button type="button" className="underline" onClick={() => startTransition(async () => { try { await copyTaskUrl(task.id); setCopied(true); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not copy task link"); } })}>Copy link <ShortcutHint commandId="task.copy-url" /></button>{copied && <span role="status">Task link copied.</span>}</div>
          {variant === "details" && <TaskAttachments key={task.id} taskId={task.id} />}
          <div>
            <label className="mb-1 block text-sm font-medium">Due date</label>
            <Popover open={dateOpen} onOpenChange={setDateOpen}>
              <PopoverTrigger
                render={
                  <Button variant="outline">
                    {dueDate ? dueDateLabel : "No due date"}
                  </Button>
                }
              />
              <PopoverContent className="w-auto p-0">
                <Calendar mode="single" selected={dueDate} onSelect={date => { setDueDate(date); setDateOpen(false); }} />
                <Button variant="ghost" onClick={() => { setDueDate(undefined); setStartTime(""); setEndTime(""); setDateOpen(false); }}>Clear date</Button>
              </PopoverContent>
            </Popover>
            {dueDate && (
              <div className="mt-2">
                <TimeRangeInputs
                  startTime={startTime}
                  endTime={endTime}
                  onStartTimeChange={setStartTime}
                  onEndTimeChange={setEndTime}
                />
              </div>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Repeat</label>
            <Select
              value={recurrenceValue}
              onValueChange={(value) => value && setRecurrenceValue(value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Does not repeat</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {onNavigate && <div className="flex gap-2"><Button variant="outline" disabled={isPending} onClick={() => save(undefined, -1)}>Previous <ShortcutHint commandId="editor.previous" /></Button><Button variant="outline" disabled={isPending} onClick={() => save(undefined, 1)}>Next <ShortcutHint commandId="editor.next" /></Button></div>}
          {variant === "inline" && onInsert && <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={isPending} onClick={() => save("above")}>Save and add above <ShortcutHint commandId="editor.save-above" /></Button><Button variant="outline" disabled={isPending} onClick={() => save("below")}>Save and add below <ShortcutHint commandId="editor.save-below" /></Button></div>}
          <Button onClick={() => save()} disabled={isPending || !title.trim()} className="w-full">
            Save {(variant === "details" || platform === "mac") && <ShortcutHint commandId="editor.save" />}
          </Button>
        </fieldset>}
      </DialogContent>
    </Dialog>
  );
}
