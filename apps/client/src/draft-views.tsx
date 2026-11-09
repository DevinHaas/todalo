// Goals ticket 19: the Coach's draft of today in the Plan sidebar. Pure view:
// the screen passes the open draft and the writes. Its items also show dashed
// on the schedule (schedule-views); nothing changes until accepted.
// Ticket 20: the same panel drafts the week shown beside the week calendar.
// Ticket 28: tasks that did not fit (overflow) ask "Schedule them tomorrow?".
import { ArrowRight, Check, Minus, Plus, Sparkles, X } from "lucide-react";
import { Button, Hint, List, Spinner } from "./ui";
import { draftCounts, type DraftDto, type DraftItemDto } from "./coach";
import { dayKey, labels } from "./schedule";

const opIcons = { add: Plus, move: ArrowRight, remove: Minus } as const;
const opLabels = { add: "Add", move: "Move", remove: "Remove" } as const;
/** "10:00–10:45" ("Tue 10:00–10:45" in a week draft); a removed task: "Off the schedule"; ticket 23's milestone: "Milestone, due Mar 1". */
export const draftTime = (item: Pick<DraftItemDto, "op" | "start" | "end" | "criteria">, week = false) =>
  item.criteria ? `Milestone, due ${labels.monthDay(new Date(item.start))}`
  : item.op === "remove" || !item.end ? "Off the schedule"
    : `${week ? `${labels.weekday(new Date(item.start))} ` : ""}${labels.time(new Date(item.start))}–${labels.time(new Date(item.end))}`;

const scopeCopy = {
  day: { action: "draft-day", draft: "Draft my day with the Coach", drafting: "Drafting your day…" },
  week: { action: "draft-week", draft: "Draft the week with the Coach", drafting: "Drafting your week…" },
} as const;

export interface DraftPanelProps {
  /** Today's plan (Today) or the week shown (the week calendar); `week` labels it ("Feb 16 – Feb 22, 2026"). */
  scope: "day" | "week";
  week?: string;
  draft: DraftDto | null;
  /** Drafting is running (the model call). */
  drafting: boolean;
  /** A decision is being saved. */
  deciding: boolean;
  /** Why the last draft attempt produced nothing. */
  message: string | null;
  /** Draft (again); absent for a draft from the Coach chat (ticket 22), which the next message replaces. */
  onDraft?(): void;
  onDecide(accept: boolean, itemIds?: string[]): void;
  /** Ticket 28: Yes drafts the overflow onto the next day with room; No drops it. */
  onOverflow(schedule: boolean): void;
}

/** "3 tasks don't fit today. Schedule them tomorrow?" (a week's or chat's: "these days", "the next day with room"). */
export function overflowQuestion(draft: Pick<DraftDto, "kind" | "overflow">) {
  const count = draft.overflow?.length ?? 0;
  const tasks = count === 1 ? "1 task doesn't" : `${count} tasks don't`;
  const them = count === 1 ? "it" : "them";
  return draft.kind === "day" ? `${tasks} fit today. Schedule ${them} tomorrow?` : `${tasks} fit these days. Schedule ${them} on the next day with room?`;
}

/** Only rendered with a Coach provider connected: without one the Plan shows no Coach at all. */
export function DraftPanel({ scope, week, draft, drafting, deciding, message, onDraft, onDecide, onOverflow }: DraftPanelProps) {
  const pending = draft?.items.filter(item => item.state === "pending") ?? [];
  const copy = scopeCopy[scope];
  if (!draft || (!pending.length && !draft.overflow)) return <div className="flex flex-col gap-1.5 pb-1" data-coach-draft="">
    <Button type="button" variant="outline" size="sm" className="self-start" disabled={drafting} onClick={onDraft} data-coach-action={copy.action}>
      {drafting ? <Spinner /> : <Sparkles className="text-brand" />}{drafting ? copy.drafting : copy.draft}
    </Button>
    {scope === "week" && week && !drafting && <Hint className="text-xs">{week}: primary goals first; secondary-goal work gives way when time is short.</Hint>}
    {message && !drafting && <Hint className="text-xs" aria-live="polite">{message}</Hint>}
  </div>;
  return <section aria-label="Coach draft" data-coach-draft={draft.id} className="flex flex-col gap-2 rounded-lg border border-dashed border-primary p-2.5">
    <div className="flex items-center justify-between gap-2">
      <h3 className="flex min-w-0 items-center gap-1.5 text-sm font-bold"><Sparkles aria-hidden="true" className="size-4 shrink-0 text-brand" />Coach draft</h3>
      <span className="truncate text-xs text-muted-foreground" data-draft-counts="">{draftCounts(draft.items)}</span>
    </div>
    {scope === "week" && week && <span className="text-xs text-muted-foreground">{week}</span>}
    {draft.summary && <Hint className="text-xs">{draft.summary}</Hint>}
    {pending.length > 0 && <List aria-label="Drafted changes">{pending.map(item => {
      const Icon = opIcons[item.op];
      return <li key={item.id} data-draft-item={item.id} data-draft-op={item.op} className="flex items-start gap-2 border-t border-border-subtle py-1.5">
        <Icon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className={item.op === "remove" ? "text-sm line-through" : "text-sm"}><span className="sr-only">{opLabels[item.op]}: </span>{item.title}</span>
          <span className="text-xs text-muted-foreground">{draftTime(item, scope === "week" || dayKey(new Date(item.start)) !== dayKey(new Date()))}</span>
          {item.criteria && <ul aria-label="Done criteria" className="list-disc pl-4 text-xs text-muted-foreground">{item.criteria.map(text => <li key={text}>{text}</li>)}</ul>}
          {item.reason && <span className="text-xs text-muted-foreground">{item.reason}</span>}
        </div>
        <div className="-my-0.5 flex shrink-0 items-center">
          <Button type="button" variant="ghost" size="icon-xs" disabled={deciding} aria-label={`Accept: ${opLabels[item.op].toLowerCase()} ${item.title}`} title="Accept"
            onClick={() => onDecide(true, [item.id])} data-draft-action="accept"><Check /></Button>
          <Button type="button" variant="ghost" size="icon-xs" disabled={deciding} aria-label={`Decline: ${opLabels[item.op].toLowerCase()} ${item.title}`} title="Decline"
            onClick={() => onDecide(false, [item.id])} data-draft-action="decline"><X /></Button>
        </div>
      </li>;
    })}</List>}
    {draft.overflow && <div data-draft-overflow="" className="flex flex-col gap-1.5 border-t border-border-subtle pt-2">
      <span className="text-sm" aria-live="polite">{overflowQuestion(draft)}</span>
      <List aria-label="Tasks that don't fit">{draft.overflow.map((item, index) => <li key={index} className="flex flex-col gap-0.5 py-0.5">
        <span className="text-sm">{item.title} <span className="text-xs text-muted-foreground">{item.minutes} min</span></span>
        {item.reason && <span className="text-xs text-muted-foreground">{item.reason}</span>}
      </li>)}</List>
      <div className="flex items-center justify-end gap-1.5">
        <Button type="button" variant="outline" size="sm" disabled={deciding} onClick={() => onOverflow(false)} data-draft-action="overflow-drop">No</Button>
        <Button type="button" size="sm" disabled={deciding} onClick={() => onOverflow(true)} data-draft-action="overflow-schedule">Yes</Button>
      </div>
    </div>}
    <div className="flex items-center justify-end gap-1.5 border-t border-border-subtle pt-2">
      {onDraft && <Button type="button" variant="ghost" size="sm" disabled={deciding || drafting} onClick={onDraft} data-coach-action={copy.action}>{drafting ? <Spinner /> : null}Draft again</Button>}
      {pending.length > 0 && <>
        <Button type="button" variant="outline" size="sm" disabled={deciding} onClick={() => onDecide(false)} data-draft-action="decline-all">Decline all</Button>
        <Button type="button" size="sm" disabled={deciding} onClick={() => onDecide(true)} data-draft-action="accept-all">Accept all</Button>
      </>}
    </div>
    {message && !drafting && <Hint className="text-xs" aria-live="polite">{message}</Hint>}
  </section>;
}
