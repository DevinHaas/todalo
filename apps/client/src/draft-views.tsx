// Goals ticket 19: the Coach's draft of today in the Plan sidebar. Pure view:
// the screen passes the open draft and the writes. Its items also show dashed
// on the schedule (schedule-views); nothing changes until accepted.
import { ArrowRight, Check, Minus, Plus, Sparkles, X } from "lucide-react";
import { Button, Hint, List, Spinner } from "./ui";
import { draftCounts, type DraftDto, type DraftItemDto } from "./coach";
import { labels } from "./schedule";

const opIcons = { add: Plus, move: ArrowRight, remove: Minus } as const;
const opLabels = { add: "Add", move: "Move", remove: "Remove" } as const;
/** "10:00–10:45"; a removed task: "Off the schedule". */
export const draftTime = (item: Pick<DraftItemDto, "op" | "start" | "end">) =>
  item.op === "remove" || !item.end ? "Off the schedule" : `${labels.time(new Date(item.start))}–${labels.time(new Date(item.end))}`;

export interface DraftPanelProps {
  draft: DraftDto | null;
  /** Drafting is running (the model call). */
  drafting: boolean;
  /** A decision is being saved. */
  deciding: boolean;
  /** Why the last draft attempt produced nothing. */
  message: string | null;
  onDraft(): void;
  onDecide(accept: boolean, itemIds?: string[]): void;
}

/** Only rendered with a Coach provider connected: without one the Plan shows no Coach at all. */
export function DraftPanel({ draft, drafting, deciding, message, onDraft, onDecide }: DraftPanelProps) {
  const pending = draft?.items.filter(item => item.state === "pending") ?? [];
  if (!draft || !pending.length) return <div className="flex flex-col gap-1.5 pb-1" data-coach-draft="">
    <Button type="button" variant="outline" size="sm" className="self-start" disabled={drafting} onClick={onDraft} data-coach-action="draft-day">
      {drafting ? <Spinner /> : <Sparkles className="text-brand" />}{drafting ? "Drafting your day…" : "Draft my day with the Coach"}
    </Button>
    {message && !drafting && <Hint className="text-xs" aria-live="polite">{message}</Hint>}
  </div>;
  return <section aria-label="Coach draft" data-coach-draft={draft.id} className="flex flex-col gap-2 rounded-lg border border-dashed border-primary p-2.5">
    <div className="flex items-center justify-between gap-2">
      <h3 className="flex min-w-0 items-center gap-1.5 text-sm font-bold"><Sparkles aria-hidden="true" className="size-4 shrink-0 text-brand" />Coach draft</h3>
      <span className="truncate text-xs text-muted-foreground" data-draft-counts="">{draftCounts(draft.items)}</span>
    </div>
    {draft.summary && <Hint className="text-xs">{draft.summary}</Hint>}
    <List aria-label="Drafted changes">{pending.map(item => {
      const Icon = opIcons[item.op];
      return <li key={item.id} data-draft-item={item.id} data-draft-op={item.op} className="flex items-start gap-2 border-t border-border-subtle py-1.5">
        <Icon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className={item.op === "remove" ? "text-sm line-through" : "text-sm"}><span className="sr-only">{opLabels[item.op]}: </span>{item.title}</span>
          <span className="text-xs text-muted-foreground">{draftTime(item)}</span>
          {item.reason && <span className="text-xs text-muted-foreground">{item.reason}</span>}
        </div>
        <div className="-my-0.5 flex shrink-0 items-center">
          <Button type="button" variant="ghost" size="icon-xs" disabled={deciding} aria-label={`Accept: ${opLabels[item.op].toLowerCase()} ${item.title}`} title="Accept"
            onClick={() => onDecide(true, [item.id])} data-draft-action="accept"><Check /></Button>
          <Button type="button" variant="ghost" size="icon-xs" disabled={deciding} aria-label={`Decline: ${opLabels[item.op].toLowerCase()} ${item.title}`} title="Decline"
            onClick={() => onDecide(false, [item.id])} data-draft-action="decline"><X /></Button>
        </div>
      </li>;
    })}</List>
    <div className="flex items-center justify-end gap-1.5 border-t border-border-subtle pt-2">
      <Button type="button" variant="ghost" size="sm" disabled={deciding || drafting} onClick={onDraft} data-coach-action="draft-day">{drafting ? <Spinner /> : null}Draft again</Button>
      <Button type="button" variant="outline" size="sm" disabled={deciding} onClick={() => onDecide(false)} data-draft-action="decline-all">Decline all</Button>
      <Button type="button" size="sm" disabled={deciding} onClick={() => onDecide(true)} data-draft-action="accept-all">Accept all</Button>
    </div>
    {message && !drafting && <Hint className="text-xs" aria-live="polite">{message}</Hint>}
  </section>;
}
