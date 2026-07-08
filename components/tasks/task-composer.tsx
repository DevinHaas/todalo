"use client";

import { useEffect, useState, useTransition } from "react";
import { addDays, format, isSameDay, nextSaturday, startOfWeek } from "date-fns";
import { Plus, Sun, CalendarIcon, X, Flag, AlarmClock, Paperclip, MoreHorizontal, Inbox, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createTask } from "@/app/(app)/tasks/actions";
import { combineDateAndTime } from "@/lib/task-dates";
import { TimeRangeInputs } from "@/components/tasks/time-range-inputs";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// ponytail: "later this week" / "this weekend" / "next week" are simple date
// heuristics, not a real quick-date engine — good enough to match Todoist's
// picker, revisit if users want smarter suggestions.
function quickDateOptions() {
  const today = startOfToday();
  return [
    { label: "Tomorrow", day: format(addDays(today, 1), "EEE"), date: addDays(today, 1) },
    { label: "Later this week", day: format(addDays(today, 2), "EEE"), date: addDays(today, 2) },
    { label: "This weekend", day: format(nextSaturday(today), "EEE"), date: nextSaturday(today) },
    {
      label: "Next week",
      day: format(addDays(startOfWeek(today, { weekStartsOn: 1 }), 7), "d MMM"),
      date: addDays(startOfWeek(today, { weekStartsOn: 1 }), 7),
    },
  ];
}

function dueDateLabel(date: Date | undefined) {
  if (!date) return "No Date";
  if (isSameDay(date, startOfToday())) return "Today";
  if (isSameDay(date, addDays(startOfToday(), 1))) return "Tomorrow";
  return format(date, "d MMM");
}

function DatePicker({
  dueDate,
  onChange,
}: {
  dueDate: Date | undefined;
  onChange: (date: Date | undefined) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={dueDate ? "text-primary" : undefined}
          >
            {dueDate && isSameDay(dueDate, startOfToday()) ? (
              <Sun className="size-4" />
            ) : (
              <CalendarIcon className="size-4" />
            )}
            {dueDateLabel(dueDate)}
            {dueDate && (
              <X
                className="size-3.5"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(undefined);
                }}
              />
            )}
          </Button>
        }
      />
      <PopoverContent className="w-auto p-0">
        <div className="p-1">
          {quickDateOptions().map(({ label, day, date }) => (
            <button
              key={label}
              type="button"
              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
              onClick={() => {
                onChange(date);
                setOpen(false);
              }}
            >
              {label}
              <span className="text-muted-foreground">{day}</span>
            </button>
          ))}
          <button
            type="button"
            className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
            onClick={() => {
              onChange(undefined);
              setOpen(false);
            }}
          >
            No Date
          </button>
        </div>
        <Calendar
          mode="single"
          selected={dueDate}
          onSelect={(date) => {
            onChange(date);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

// ponytail: Priority/Reminders/Attachment mirror Todoist's composer visually
// but there's no priority/reminder/attachment data model yet — inert stubs.
function StubPill({ icon: Icon, label }: { icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <Button type="button" variant="outline" size="sm" disabled>
      <Icon className="size-4" />
      {label}
    </Button>
  );
}

export function TaskComposer({
  defaultToToday = false,
  open,
  onOpenChange,
  initialDueDate,
  initialStartTime,
  initialEndTime,
}: {
  defaultToToday?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  initialDueDate?: Date;
  initialStartTime?: string;
  initialEndTime?: string;
}) {
  const controlled = open !== undefined;
  const [uncontrolledExpanded, setUncontrolledExpanded] = useState(false);
  const expanded = controlled ? open : uncontrolledExpanded;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState<Date | undefined>(
    initialDueDate ?? (defaultToToday ? startOfToday() : undefined),
  );
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [isPending, startTransition] = useTransition();

  // Controlled mode (e.g. clicking a calendar slot) seeds the form from the
  // slot that was clicked each time the dialog opens.
  useEffect(() => {
    if (!controlled || !open) return;
    setTitle("");
    setDescription("");
    setDueDate(initialDueDate ?? (defaultToToday ? startOfToday() : undefined));
    setStartTime(initialStartTime ?? "");
    setEndTime(initialEndTime ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlled, open]);

  function setExpanded(value: boolean) {
    if (controlled) {
      onOpenChange?.(value);
    } else {
      setUncontrolledExpanded(value);
    }
  }

  function reset() {
    setTitle("");
    setDescription("");
    setDueDate(initialDueDate ?? (defaultToToday ? startOfToday() : undefined));
    setStartTime("");
    setEndTime("");
    setExpanded(false);
  }

  function submit() {
    if (!title.trim()) return;
    const finalDueDate = dueDate && startTime ? combineDateAndTime(dueDate, startTime) : dueDate;
    const dueDateEnd = dueDate && endTime ? combineDateAndTime(dueDate, endTime) : undefined;
    startTransition(async () => {
      await createTask({
        title,
        description: description || undefined,
        dueDate: finalDueDate,
        dueDateEnd,
      });
      reset();
    });
  }

  const form = (
    <>
      <Input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Task name"
        className="border-0 px-0 text-base font-medium focus-visible:ring-0"
      />
      <Input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description"
        className="border-0 px-0 text-sm focus-visible:ring-0"
      />
      <div className="flex flex-wrap items-center gap-2">
        <DatePicker dueDate={dueDate} onChange={setDueDate} />
        {dueDate && (
          <TimeRangeInputs
            startTime={startTime}
            endTime={endTime}
            onStartTimeChange={setStartTime}
            onEndTimeChange={setEndTime}
          />
        )}
        <StubPill icon={Flag} label="Priority" />
        <StubPill icon={AlarmClock} label="Reminders" />
        <StubPill icon={Paperclip} label="Attachment" />
        <Button type="button" variant="outline" size="icon-sm" disabled>
          <MoreHorizontal className="size-4" />
        </Button>
      </div>
      <div className="flex items-center justify-between border-t pt-3">
        <Button type="button" variant="outline" size="sm" disabled>
          <Inbox className="size-4" />
          Inbox
          <ChevronDown className="size-3.5" />
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={reset}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={!title.trim() || isPending}>
            Add task
          </Button>
        </div>
      </div>
    </>
  );

  if (controlled) {
    return (
      <Dialog open={open} onOpenChange={setExpanded}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="sr-only">Add task</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">{form}</div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="flex w-full items-center gap-2 border-t py-3 text-sm text-muted-foreground hover:text-foreground"
      >
        <Plus className="size-4 text-destructive" />
        Add task
      </button>
    );
  }

  return <div className="space-y-2 rounded-lg border p-3">{form}</div>;
}
