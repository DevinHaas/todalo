"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useTransition } from "react";
import { addDays, format, isSameDay, nextSaturday, startOfWeek } from "date-fns";
import { Plus, Sun, CalendarIcon, X, Flag, AlarmClock, Paperclip, MoreHorizontal, Inbox, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createTask } from "@/app/(app)/tasks/actions";
import { combineDateAndTime } from "@/lib/task-dates";
import { TimeRangeInputs } from "@/components/tasks/time-range-inputs";
import { parseQuickAddOrPlain, type QuickAddMatch } from "@/lib/parse-quick-add";
import { useSmartDateRecognition } from "@/components/settings/smart-date-recognition";
import {
  canonicalDateText,
  canonicalRecurrenceText,
  canonicalTimeText,
  initialSyncState,
  spliceMatch,
  syncQuickAddFields,
} from "@/lib/quick-add-sync";
import { cn } from "@/lib/utils";
import type { Recurrence } from "@/lib/recurrence";

const PARSE_DEBOUNCE_MS = 150;

// Shared box model between the transparent input and the backdrop it sits
// on, so highlighted spans in the backdrop line up exactly under the text
// rendered by the input. See docs/adr/0002-quick-add-highlighting-technique.md.
const TITLE_FIELD_CLASSES = "h-8 border-0 px-0 py-1 text-base font-medium whitespace-pre md:text-sm";

const UNIT_OPTIONS: { value: Recurrence["unit"]; label: (n: number) => string }[] = [
  { value: "day", label: (n) => (n === 1 ? "day" : "days") },
  { value: "week", label: (n) => (n === 1 ? "week" : "weeks") },
  { value: "month", label: (n) => (n === 1 ? "month" : "months") },
  { value: "year", label: (n) => (n === 1 ? "year" : "years") },
];

function CustomRepeatDialog({
  open,
  onOpenChange,
  recurrence,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recurrence: Recurrence | undefined;
  onConfirm: (recurrence: Recurrence) => void;
}) {
  const [basedOn, setBasedOn] = useState<Recurrence["basedOn"]>("scheduled");
  const [n, setN] = useState("1");
  const [unit, setUnit] = useState<Recurrence["unit"]>("day");
  const [ends, setEnds] = useState<"never" | "on">("never");
  const [until, setUntil] = useState<Date | undefined>(undefined);
  const [untilPickerOpen, setUntilPickerOpen] = useState(false);

  // Re-seed from the current recurrence (or defaults) each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setBasedOn(recurrence?.basedOn ?? "scheduled");
    setN(String(recurrence?.n ?? 1));
    setUnit(recurrence?.unit ?? "day");
    setEnds(recurrence?.until ? "on" : "never");
    setUntil(recurrence?.until ?? undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function confirm() {
    const parsedN = parseInt(n, 10);
    if (!(parsedN > 0)) return;
    if (ends === "on" && !until) return;
    onConfirm({ n: parsedN, unit, basedOn, until: ends === "on" ? until : null });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Custom repeat</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">Based on</div>
            <div className="flex gap-1.5">
              <Button
                type="button"
                variant={basedOn === "scheduled" ? "default" : "outline"}
                size="sm"
                onClick={() => setBasedOn("scheduled")}
              >
                Scheduled date
              </Button>
              <Button
                type="button"
                variant={basedOn === "completed" ? "default" : "outline"}
                size="sm"
                onClick={() => setBasedOn("completed")}
              >
                Completed date
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <span>Every</span>
            <Input
              type="number"
              min={1}
              value={n}
              onChange={(e) => setN(e.target.value)}
              className="h-8 w-16 px-1.5"
            />
            <Select value={unit} onValueChange={(value) => setUnit(value as Recurrence["unit"])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNIT_OPTIONS.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>
                    {label(parseInt(n, 10) || 1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">Ends</div>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant={ends === "never" ? "default" : "outline"}
                size="sm"
                onClick={() => setEnds("never")}
              >
                Never
              </Button>
              <Popover open={untilPickerOpen} onOpenChange={setUntilPickerOpen}>
                <PopoverTrigger
                  render={
                    <Button
                      type="button"
                      variant={ends === "on" ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setEnds("on");
                        setUntilPickerOpen(true);
                      }}
                    >
                      {ends === "on" && until ? `On ${format(until, "d MMM yyyy")}` : "On date"}
                    </Button>
                  }
                />
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={until}
                    onSelect={(date) => {
                      setUntil(date);
                      setUntilPickerOpen(false);
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t pt-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={confirm} disabled={!(parseInt(n, 10) > 0) || (ends === "on" && !until)}>
            Set
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

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

function ordinal(n: number) {
  const suffixes = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${suffixes[(v - 20) % 10] ?? suffixes[v] ?? suffixes[0]}`;
}

// "Every week on <weekday>" and "Every month on the <Nth>" anchor to the
// currently picked date (falling back to today when nothing is picked yet)
// rather than storing a separate weekday/day-of-month field — addWeeks /
// addMonths naturally preserve it.
function repeatPresets(anchor: Date): { label: string; recurrence: Recurrence }[] {
  return [
    { label: "Every day", recurrence: { n: 1, unit: "day", basedOn: "scheduled" } },
    { label: `Every week on ${format(anchor, "EEEE")}`, recurrence: { n: 1, unit: "week", basedOn: "scheduled" } },
    {
      label: `Every month on the ${ordinal(anchor.getDate())}`,
      recurrence: { n: 1, unit: "month", basedOn: "scheduled" },
    },
  ];
}

function DatePicker({
  dueDate,
  onChange,
  recurrence,
  onRecurrenceChange,
}: {
  dueDate: Date | undefined;
  onChange: (date: Date | undefined) => void;
  recurrence: Recurrence | undefined;
  onRecurrenceChange: (recurrence: Recurrence | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const [everyNDays, setEveryNDays] = useState("1");
  const [customOpen, setCustomOpen] = useState(false);
  const anchor = dueDate ?? startOfToday();

  return (
    <>
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
          <div className="border-t p-1">
            <div className="px-2 py-1 text-xs font-medium text-muted-foreground">Repeat</div>
            <button
              type="button"
              className={`flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted ${
                !recurrence ? "text-primary" : ""
              }`}
              onClick={() => {
                onRecurrenceChange(undefined);
                setOpen(false);
              }}
            >
              Don&apos;t repeat
            </button>
            {repeatPresets(anchor).map(({ label, recurrence: preset }) => (
              <button
                key={label}
                type="button"
                className={`flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted ${
                  recurrence?.n === preset.n && recurrence?.unit === preset.unit ? "text-primary" : ""
                }`}
                onClick={() => {
                  onRecurrenceChange(preset);
                  setOpen(false);
                }}
              >
                {label}
              </button>
            ))}
            <div className="flex items-center gap-1.5 px-2 py-1.5 text-sm">
              <span>Every</span>
              <Input
                type="number"
                min={1}
                value={everyNDays}
                onChange={(e) => setEveryNDays(e.target.value)}
                className="h-7 w-14 px-1.5"
              />
              <span>days</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="ml-auto"
                onClick={() => {
                  const n = parseInt(everyNDays, 10);
                  if (n > 0) {
                    onRecurrenceChange({ n, unit: "day", basedOn: "scheduled" });
                    setOpen(false);
                  }
                }}
              >
                Set
              </Button>
            </div>
            <button
              type="button"
              className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
              onClick={() => {
                setCustomOpen(true);
                setOpen(false);
              }}
            >
              Custom...
            </button>
          </div>
        </PopoverContent>
      </Popover>
      <CustomRepeatDialog
        open={customOpen}
        onOpenChange={setCustomOpen}
        recurrence={recurrence}
        onConfirm={onRecurrenceChange}
      />
    </>
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
  const { enabled: smartDateRecognitionEnabled } = useSmartDateRecognition();
  const controlled = open !== undefined;
  const [uncontrolledExpanded, setUncontrolledExpanded] = useState(false);
  const expanded = controlled ? open : uncontrolledExpanded;
  const [title, setTitle] = useState("");
  const [debouncedTitle, setDebouncedTitle] = useState("");
  const [description, setDescription] = useState("");
  const [rejected, setRejected] = useState<Set<string>>(new Set());
  const [syncState, dispatchSync] = useReducer(syncQuickAddFields, initialSyncState, () =>
    syncQuickAddFields(initialSyncState, {
      type: "seed",
      date: initialDueDate ?? (defaultToToday ? startOfToday() : undefined),
      time: initialStartTime ?? "",
    }),
  );
  const dueDate = syncState.date.value;
  const startTime = syncState.time.value;
  const recurrence = syncState.recurrence.value;
  const [endTime, setEndTime] = useState(initialEndTime ?? "");
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedTitle(title), PARSE_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [title]);

  const isRejected = useCallback(
    (match: QuickAddMatch) => rejected.has(match.text.toLowerCase()),
    [rejected],
  );

  const parsed = useMemo(
    () => parseQuickAddOrPlain(debouncedTitle, smartDateRecognitionEnabled, undefined, { isRejected }),
    [debouncedTitle, smartDateRecognitionEnabled, isRejected],
  );

  // Live parsing drives dueDate/startTime/recurrence unless a manual edit
  // (DatePicker/TimeRangeInputs/Repeat row/reject) has overridden that field
  // — see lib/quick-add-sync.ts for the last-touch-wins rules.
  useEffect(() => {
    dispatchSync({ type: "parse", parsed });
  }, [parsed]);

  const segments = useMemo(() => {
    // Only trust the debounced parse's offsets once the title has caught up
    // to it — otherwise a highlight could momentarily land under the wrong
    // word while the user is still mid-keystroke.
    const matches = debouncedTitle === title ? parsed.matches : [];
    const result: { text: string; match: QuickAddMatch | null }[] = [];
    let cursor = 0;
    for (const match of matches) {
      if (match.start > cursor) result.push({ text: title.slice(cursor, match.start), match: null });
      result.push({ text: title.slice(match.start, match.end), match });
      cursor = match.end;
    }
    if (cursor < title.length) result.push({ text: title.slice(cursor), match: null });
    return result;
  }, [title, debouncedTitle, parsed.matches]);

  function reject(match: QuickAddMatch) {
    setRejected((prev) => new Set(prev).add(match.text.toLowerCase()));
    dispatchSync({ type: "reject", kind: match.kind });
  }

  function syncScroll() {
    if (backdropRef.current && inputRef.current) {
      backdropRef.current.scrollLeft = inputRef.current.scrollLeft;
    }
  }

  // A manual field edit overrides live parsing and rewrites whatever phrase
  // is currently matched in the title to a canonical form, so the title and
  // the picker never visibly disagree — see spec's "Field sync" bullet.
  function currentMatch(kind: QuickAddMatch["kind"]) {
    return parseQuickAddOrPlain(title, smartDateRecognitionEnabled, undefined, { isRejected }).matches.find(
      (m) => m.kind === kind,
    );
  }

  // Shared by all three manual-edit handlers below: rewrites the currently
  // matched phrase (if any) to its canonical form and returns the text that
  // should anchor the field going forward — null if no phrase is set.
  function applyManualPhrase(kind: QuickAddMatch["kind"], canonical: string | null): string | null {
    const match = currentMatch(kind);
    if (canonical && match) {
      setTitle((t) => spliceMatch(t, match, canonical));
      return canonical;
    }
    return match?.text ?? null;
  }

  function handleDueDateChange(date: Date | undefined) {
    const matchText = applyManualPhrase("date", date ? canonicalDateText(date) : null);
    dispatchSync({ type: "manualDate", date, matchText });
  }

  function handleStartTimeChange(time: string) {
    const matchText = applyManualPhrase("time", time ? canonicalTimeText(time) : null);
    dispatchSync({ type: "manualTime", time, matchText });
  }

  function handleRecurrenceChange(nextRecurrence: Recurrence | undefined) {
    const matchText = applyManualPhrase("recurrence", nextRecurrence ? canonicalRecurrenceText(nextRecurrence) : null);
    dispatchSync({ type: "manualRecurrence", recurrence: nextRecurrence, matchText });
  }

  // Controlled mode (e.g. clicking a calendar slot) seeds the form from the
  // slot that was clicked each time the dialog opens.
  useEffect(() => {
    if (!controlled || !open) return;
    setTitle("");
    setDebouncedTitle("");
    setDescription("");
    setRejected(new Set());
    dispatchSync({
      type: "seed",
      date: initialDueDate ?? (defaultToToday ? startOfToday() : undefined),
      time: initialStartTime ?? "",
    });
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
    setDebouncedTitle("");
    setRejected(new Set());
    setDescription("");
    // Unlike the controlled-open effect above, resetting after a submit/cancel
    // always clears start/end time — only dueDate reseeds from the initial
    // prop — matching this function's pre-sync behavior.
    dispatchSync({ type: "seed", date: initialDueDate ?? (defaultToToday ? startOfToday() : undefined), time: "" });
    setEndTime("");
    setExpanded(false);
  }

  function submit() {
    if (!title.trim()) return;
    const finalParsed = parseQuickAddOrPlain(title, smartDateRecognitionEnabled, undefined, { isRejected });
    const finalTitle = finalParsed.strippedTitle || title.trim();
    const finalDueDate = dueDate && startTime ? combineDateAndTime(dueDate, startTime) : dueDate;
    const dueDateEnd = dueDate && endTime ? combineDateAndTime(dueDate, endTime) : undefined;
    startTransition(async () => {
      await createTask({
        title: finalTitle,
        description: description || undefined,
        dueDate: finalDueDate,
        dueDateEnd,
        recurrence,
      });
      reset();
    });
  }

  const form = (
    <>
      <div className="relative h-8 min-w-0">
        <div
          ref={backdropRef}
          aria-hidden
          className={cn(
            TITLE_FIELD_CLASSES,
            "pointer-events-none absolute inset-0 overflow-hidden text-transparent",
          )}
        >
          {segments.map((segment, i) =>
            segment.match ? (
              <span
                key={i}
                role="button"
                tabIndex={-1}
                onClick={() => reject(segment.match!)}
                className="relative z-10 cursor-pointer rounded bg-primary/20 pointer-events-auto"
              >
                {segment.text}
              </span>
            ) : (
              <span key={i}>{segment.text}</span>
            ),
          )}
        </div>
        <input
          ref={inputRef}
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onScroll={syncScroll}
          placeholder="Task name"
          className={cn(
            TITLE_FIELD_CLASSES,
            "absolute inset-0 w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-0",
          )}
        />
      </div>
      <Input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description"
        className="border-0 px-0 text-sm focus-visible:ring-0"
      />
      <div className="flex flex-wrap items-center gap-2">
        <DatePicker
          dueDate={dueDate}
          onChange={handleDueDateChange}
          recurrence={recurrence}
          onRecurrenceChange={handleRecurrenceChange}
        />
        {dueDate && (
          <TimeRangeInputs
            startTime={startTime}
            endTime={endTime}
            onStartTimeChange={handleStartTimeChange}
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
