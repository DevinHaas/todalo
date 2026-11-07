// The time block editor (goals ticket 07): title, goal, start and end, delete.
// Pure view: the screen passes the block, goals and writes. The time fields are
// the keyboard way to move and resize a block.
import { useState, type FormEvent } from "react";
import {
  Button, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle, Field, FieldLabel, Input,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "./ui";
import { FormError, GoalDot } from "./goal-views";
import { addDays, labels, startOfDay } from "./schedule";
import type { GoalDto } from "./goals";
import type { TimeBlockDto, TimeBlockPatch } from "./time-blocks";

const NO_GOAL = "none";
/** "HH:mm" on the block's day; an end at or before the start is the next midnight-crossing day. */
const onDay = (day: Date, time: string, after?: Date) => {
  const [hours, minutes] = time.split(":").map(Number);
  const date = startOfDay(day);
  date.setHours(hours ?? 0, minutes ?? 0, 0, 0);
  return after && date <= after ? addDays(date, 1) : date;
};

export function TimeBlockDialog({ block, goals, onSave, onDelete, onClose }: {
  block: TimeBlockDto;
  /** Active goals; empty while Goals is hidden (no goal picker). */
  goals: GoalDto[];
  onSave: (patch: TimeBlockPatch) => Promise<unknown>;
  onDelete: () => Promise<unknown>;
  onClose: () => void;
}) {
  const start = new Date(block.start), end = new Date(block.end);
  const [title, setTitle] = useState(block.title ?? "");
  const [goalId, setGoalId] = useState(block.goalId ?? NO_GOAL);
  const [from, setFrom] = useState(labels.time(start));
  const [to, setTo] = useState(labels.time(end));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const run = async (write: () => Promise<unknown>) => {
    setPending(true); setError(null);
    try { await write(); onClose(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Your changes could not be saved. Try again."); }
    finally { setPending(false); }
  };
  function submit(event: FormEvent) {
    event.preventDefault();
    const nextStart = onDay(start, from);
    const nextEnd = onDay(start, to, nextStart);
    void run(() => onSave({ title, start: nextStart.toISOString(), end: nextEnd.toISOString(), ...(goals.length || block.goalId ? { goalId: goalId === NO_GOAL ? null : goalId } : {}) }));
  }
  const choices = [{ value: NO_GOAL, label: "No goal" }, ...goals.map(goal => ({ value: goal.id, label: goal.title }))];
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent>
      <form className="flex min-h-0 flex-col gap-4" aria-label="Time block" data-time-block={block.id} onSubmit={submit}>
        <DialogHeader><DialogTitle>Time block</DialogTitle></DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          <Field><FieldLabel htmlFor="block-title">Title</FieldLabel>
            <Input id="block-title" autoFocus placeholder="Time block" maxLength={200} value={title} onChange={event => setTitle(event.target.value)} /></Field>
          {goals.length > 0 && <Field><FieldLabel>Goal</FieldLabel>
            <Select items={choices} value={goalId} onValueChange={(value) => { if (value) setGoalId(value as string); }}>
              <SelectTrigger aria-label="Goal" data-field="goal"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_GOAL}>No goal</SelectItem>
                {goals.map(goal => <SelectItem key={goal.id} value={goal.id}><GoalDot color={goal.color} />{goal.title}</SelectItem>)}
              </SelectContent>
            </Select></Field>}
          <div className="flex gap-3">
            <Field><FieldLabel htmlFor="block-start">Start</FieldLabel><Input id="block-start" type="time" step={900} required value={from} onChange={event => setFrom(event.target.value)} /></Field>
            <Field><FieldLabel htmlFor="block-end">End</FieldLabel><Input id="block-end" type="time" step={900} required value={to} onChange={event => setTo(event.target.value)} /></Field>
          </div>
          {error && <FormError>{error}</FormError>}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="ghost" className="mr-auto text-destructive" data-block-action="delete" disabled={pending} onClick={() => void run(onDelete)}>Delete</Button>
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" data-block-action="save" disabled={pending}>Save</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
