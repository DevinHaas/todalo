// Goals ticket 29: the Coach bar, floating at the bottom of every main view.
// All talking to the Coach happens here: type a question or a change, attach
// documents (paperclip, drop, paste), read the short reply, and keep or drop
// the changes it drafts ("4 added, 1 moved, 1 removed", × declines, ✓ accepts;
// Review lists them one by one). The changes show dashed in place meanwhile
// (pending-changes.tsx, the calendar); nothing is written until accepted. The
// review groups them by kind (Added, Moved…); a group opens to its changes, and
// ✓/× decide a group or a single change. The
// right sidebar (coach-chat-screens.tsx) is the read-only record.
// Ticket 30: accepting a change that deletes tasks asks once more ("Delete 3
// tasks? This can't be undone."); a change whose task changed since is left out.
// Ticket 32: a "Tidy up" chip (shown while stale tasks wait) sends TIDY_PROMPT;
// the Weekly review sends the same through askCoach.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ClipboardEvent, type DragEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUp, Check, ChevronDown, ChevronRight, FileText, Image, Paperclip, Sparkles, X } from "lucide-react";
import { coach, coachReads, goalReads, reads } from "./runtime";
import { coachKeys, draftCounts, draftMutations, type CoachChatDto, type CoachDocumentDto, type DraftDto } from "./coach";
import { draftOps, type DraftOp } from "../../../packages/server/src/drafts";
import { documentProblem } from "../../../packages/server/src/coach-documents";
import { TIDY_PROMPT, staleTasks } from "../../../packages/server/src/task-dto";
import { draftTime, opIcons, opLabels, overflowQuestion, useParentTitle } from "./draft-views";
import { dayKey } from "./schedule";
import { goalColorValue } from "./goals";
import { localZone } from "./seasons";
import { modalOpen } from "./keyboard";
import { reportCoachError } from "./coach-errors";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  Button, Hint, List, Spinner, Textarea, cn,
} from "./ui";

/** Accepted in the picker (the server checks again, by kind). */
const ACCEPT = ".pdf,.docx,.txt,.md,.markdown,.csv,.png,.jpg,.jpeg,.gif,.webp,application/pdf,text/*,image/png,image/jpeg,image/gif,image/webp";

let state = { focus: 0, prompt: null as string | null, send: false };
const watchers = new Set<() => void>();
const barState = { get: () => state, subscribe: (watcher: () => void) => { watchers.add(watcher); return () => { watchers.delete(watcher); }; } };
/** Focuses the bar's field; `prompt` pre-fills it (a recommendation's "Chat with coach") for the user to edit and send. */
export const focusCoachBar = (prompt?: string) => { state = { focus: state.focus + 1, prompt: prompt ?? null, send: false }; watchers.forEach(watcher => watcher()); };
/** Ticket 32: sends `prompt` from the bar as if typed (the Weekly review's "Tidy up"). */
export const askCoach = (prompt: string) => { state = { focus: state.focus + 1, prompt, send: true }; watchers.forEach(watcher => watcher()); };

/** Only with a Coach provider connected: without one there is no bar. */
export function CoachBar({ userId }: { userId: string }) {
  const connected = Boolean(useQuery(coachReads.provider(userId)).data?.provider);
  return connected ? <Bar userId={userId} /> : null;
}

function Bar({ userId }: { userId: string }) {
  const cache = useQueryClient();
  const { focus, prompt, send: sending } = useSyncExternalStore(barState.subscribe, barState.get);
  const chat = useQuery(coachReads.chat(userId));
  const drafts = useQuery(coachReads.drafts(userId));
  const goals = useQuery(goalReads.list(userId));
  const writes = useMemo(() => draftMutations(coach, cache, userId), [cache, userId]);
  const [text, setText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [replyOpen, setReplyOpen] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [dragging, setDragging] = useState(false);
  /** Ticket 30: an accept that deletes tasks, waiting for the second confirm. */
  const [deleting, setDeleting] = useState<{ itemIds?: string[]; count: number } | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!focus) return;
    if (prompt) setText(prompt);
    field.current?.focus();
  }, [focus, prompt]);
  const setChat = (next: Partial<CoachChatDto>) => cache.setQueryData<CoachChatDto>(coachKeys.chat(userId), current => ({ messages: [], ...current, ...next }));

  const send = useMutation({
    mutationFn: (body: string) => coach.sendChat(localZone(), body),
    onMutate: () => { setMessage(null); setReplyOpen(true); },
    onSuccess: (result, body) => {
      // Ticket 17d: a failed model call toasts (Retry sends the same text); the field keeps it.
      if (reportCoachError(result.error, { retry: () => send.mutate(body) })) { setReplyOpen(false); return; }
      if (result.message) { setMessage(result.message); setReplyOpen(false); return; }
      setChat({ messages: result.messages, ...(result.documents && { documents: result.documents }) });
      // A reply may also have revised another draft's pending changes: the views show them at once.
      void cache.invalidateQueries({ queryKey: coachKeys.drafts(userId) });
      if (result.draft) setReviewing(false);
      setText(current => current === body ? "" : current);
    },
    onError: () => setReplyOpen(false),
    meta: { action: () => "send your message to the Coach" },
  });
  // Ticket 32: askCoach sends at once; the field shows the request until the reply.
  useEffect(() => {
    if (focus && sending && prompt && !send.isPending) send.mutate(prompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new askCoach sends
  }, [focus, sending, prompt]);
  // Ticket 32: the open tasks nobody touched for 30+ days, for the "Tidy up" chip.
  const tasks = useQuery(reads.today(userId)).data?.tasks;
  const stale = useMemo(() => tasks ? staleTasks(tasks, new Date()).length : 0, [tasks]);
  const upload = useMutation({
    mutationFn: (files: File[]) => coach.uploadDocuments(files),
    onSuccess: (result) => setChat({ documents: result.documents }),
    meta: { action: () => "attach your documents" },
  });
  const remove = useMutation({
    mutationFn: (id: string) => coach.removeDocument(id),
    onSuccess: (result) => setChat({ documents: result.documents }),
    meta: { action: () => "remove the document" },
  });
  const decide = useMutation({ mutationFn: writes.decide, onSuccess: (result) => setMessage(result.message ?? null), meta: { action: ({ accept }: { accept: boolean }) => accept ? "accept the changes" : "decline the changes" } });
  const overflow = useMutation({ mutationFn: writes.overflow, onSuccess: (result) => setMessage(result.message ?? result.next?.summary ?? null), meta: { action: ({ schedule }: { schedule: boolean }) => schedule ? "schedule the tasks that didn't fit" : "drop the tasks that didn't fit" } });

  const documents = chat.data?.documents ?? [];
  const attach = (files: File[]) => {
    if (!files.length || upload.isPending) return;
    // The limits and kinds first, so the user reads the specific rule.
    const problem = documentProblem(files, documents.length);
    if (problem) { setMessage(problem); return; }
    setMessage(null);
    upload.mutate(files);
  };
  const reply = chat.data?.messages.filter(item => item.role === "assistant").at(-1)?.content ?? null;
  // The latest chat draft still to decide (a new message replaces it).
  const draft = drafts.data?.drafts.filter(item => item.kind === "chat" && (item.items.some(row => row.state === "pending") || item.overflow)).at(-1) ?? null;
  const pending = draft?.items.filter(item => item.state === "pending") ?? [];
  const colors = [...new Set(pending.flatMap(item => {
    const goal = goals.data?.hidden ? undefined : goals.data?.goals.find(entry => entry.id === item.goalId);
    return goal ? [goalColorValue(goal.color)] : [];
  }))].slice(0, 3);
  useEffect(() => { if (!draft) setReviewing(false); }, [draft]);
  // Accepting (all, or some) asks again first when it deletes tasks; declining never does.
  const onDecide = (accept: boolean, itemIds?: string[]) => {
    if (!draft) return;
    const count = accept ? pending.filter(item => item.op === "delete" && (!itemIds || itemIds.includes(item.id))).length : 0;
    if (count) setDeleting({ itemIds, count });
    else decide.mutate({ draftId: draft.id, accept, itemIds });
  };
  // Escape closes the reply (and the review) while no dialog owns the keyboard.
  useEffect(() => {
    if (!replyOpen && !reviewing) return;
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || modalOpen()) return;
      setReplyOpen(false); setReviewing(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [replyOpen, reviewing]);
  const submit = () => { const body = text.trim(); if (body && !send.isPending) send.mutate(body); };
  const files = (list: FileList | null | undefined) => [...list ?? []];

  // Centred over the main column: a right sidebar inside the page (Plan, rituals; gap-4 beside it) is left out.
  return <div className="ui pointer-events-none sticky bottom-0 z-[25] flex justify-center pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:in-[.content:has([data-ritual-panel])]:pr-[calc(var(--spacing-sidebar)+1rem)] md:in-[.content:has([data-plan],[data-coach-chat])]:pr-[calc(var(--spacing-plan)+1rem)]" data-coach-bar="">
    <div className="pointer-events-auto flex w-full max-w-(--spacing-page) flex-col gap-2">
      {replyOpen && (send.isPending || reply) && <section aria-label="Coach reply" aria-live="polite" data-coach-reply=""
        className="flex items-start gap-2.5 rounded-xl border border-border bg-background p-3 shadow-popover">
        <Sparkles aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand" />
        {send.isPending ? <span className="flex flex-1 items-center gap-1.5 text-sm text-muted-foreground" role="status"><Spinner />The Coach is thinking…</span>
          : <p className="flex-1 whitespace-pre-wrap text-sm">{reply}</p>}
        <Button type="button" variant="ghost" size="icon-xs" aria-label="Close reply" title="Close (Esc)" onClick={() => setReplyOpen(false)}><X /></Button>
      </section>}
      {draft && reviewing && <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-border bg-background p-1 shadow-popover" data-coach-review="">
        <ChangeGroups draft={draft} deciding={decide.isPending || overflow.isPending}
          onDecide={onDecide} onOverflow={(schedule) => overflow.mutate({ draftId: draft.id, schedule })} />
      </div>}
      {draft && <div role="group" aria-label="Coach changes" data-coach-draft={draft.id}
        className="flex items-center gap-2 rounded-full border border-border bg-background py-1 pr-1 pl-3 shadow-popover">
        <span aria-hidden="true" className="flex -space-x-1">{(colors.length ? colors : [null]).map((color, index) =>
          <span key={index} className={cn("size-2.5 rounded-full border border-background", !color && "bg-muted-foreground")} style={color ? { backgroundColor: color } : undefined} />)}</span>
        <button type="button" className="flex min-w-0 flex-1 items-center gap-1 text-left text-sm" aria-expanded={reviewing} data-coach-bar-action="review"
          onClick={() => setReviewing(open => !open)}>
          <span className="truncate" data-draft-counts="">{draftCounts(draft.items) || "Tasks that don't fit"}</span>
          <ChevronDown aria-hidden="true" className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", reviewing && "rotate-180")} />
          <span className="sr-only">{reviewing ? "Hide" : "Review"} each change</span>
        </button>
        {pending.length > 0 && <>
          <Button type="button" variant="ghost" size="icon" aria-label="Decline all changes" title="Decline all" disabled={decide.isPending}
            onClick={() => onDecide(false)} data-draft-action="decline-all"><X /></Button>
          <Button type="button" size="icon" className="rounded-full" aria-label="Accept all changes" title="Accept all" disabled={decide.isPending}
            onClick={() => onDecide(true)} data-draft-action="accept-all">{decide.isPending ? <Spinner /> : <Check />}</Button>
        </>}
      </div>}
      <form aria-label="Talk to the Coach" data-coach-bar-composer="" data-dragging={dragging || undefined}
        className={cn("flex flex-col gap-1.5 rounded-xl border border-border bg-background p-1.5 shadow-popover", dragging && "border-dashed border-brand")}
        onSubmit={(event) => { event.preventDefault(); submit(); }}
        onDragOver={(event: DragEvent) => { if (!event.dataTransfer.types.includes("Files")) return; event.preventDefault(); setDragging(true); }}
        onDragLeave={(event: DragEvent) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
        onDrop={(event: DragEvent) => { if (!event.dataTransfer.files.length) return; event.preventDefault(); setDragging(false); attach(files(event.dataTransfer.files)); }}>
        {(documents.length > 0 || upload.isPending) && <ul aria-label="Attached documents" className="flex flex-wrap gap-1 px-1 pt-0.5">
          {documents.map(document => <DocumentChip key={document.id} document={document} disabled={remove.isPending} onRemove={() => remove.mutate(document.id)} />)}
          {upload.isPending && <li className="flex items-center gap-1 text-xs text-muted-foreground" role="status"><Spinner />Reading…</li>}
        </ul>}
        {message && <Hint className="px-1 text-xs text-destructive" role="alert">{message}</Hint>}
        {stale > 0 && !text && !draft && !send.isPending && <div className="flex px-1 pt-0.5">
          <Button type="button" variant="outline" size="xs" className="rounded-full" onClick={() => send.mutate(TIDY_PROMPT)} data-coach-bar-action="tidy"
            title={`${stale} open task${stale === 1 ? "" : "s"} untouched for 30+ days`}><Sparkles className="text-brand" />Tidy up</Button>
        </div>}
        <div className="flex items-end gap-1">
          <Button type="button" variant="ghost" size="icon" className="size-control!" aria-label="Attach a document" title="Attach a document (PDF, Word, text, image)"
            disabled={upload.isPending} onClick={() => picker.current?.click()} data-coach-bar-action="attach"><Paperclip /></Button>
          <input ref={picker} type="file" multiple accept={ACCEPT} hidden aria-hidden="true" tabIndex={-1}
            onChange={(event) => { attach(files(event.target.files)); event.target.value = ""; }} />
          <Textarea ref={field} rows={1} maxLength={4_000} aria-label="Message the Coach" placeholder="Ask the Coach or ask for a change…" value={text}
            className="max-h-40 min-h-control flex-1 resize-none border-0 py-1.5 text-sm leading-5 shadow-none focus-visible:ring-0" data-coach-bar-input=""
            onChange={(event) => setText(event.target.value)}
            onPaste={(event: ClipboardEvent) => { const pasted = files(event.clipboardData.files); if (pasted.length) { event.preventDefault(); attach(pasted); } }}
            onKeyDown={(event) => {
              // Enter sends, Shift+Enter is a new line; Escape closes the reply first, then leaves the field.
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); }
              if (event.key === "Escape") { event.preventDefault(); if (replyOpen || reviewing) { setReplyOpen(false); setReviewing(false); } else field.current?.blur(); }
            }} />
          <Button type="submit" size="icon" className="size-control!" aria-label="Send" title="Send (Enter)" disabled={!text.trim() || send.isPending} data-coach-bar-action="send">
            {send.isPending ? <Spinner /> : <ArrowUp />}
          </Button>
        </div>
      </form>
    </div>
    {deleting && draft && <AlertDialog open onOpenChange={(open) => { if (!open) setDeleting(null); }}>
      <AlertDialogContent data-coach-delete-confirm="">
        <AlertDialogHeader><AlertDialogTitle>{deleting.count === 1 ? "Delete 1 task?" : `Delete ${deleting.count} tasks?`}</AlertDialogTitle>
          <AlertDialogDescription>This can't be undone. Sub-tasks are deleted with their task.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setDeleting(null)}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive-outline" autoFocus data-draft-action="confirm-delete"
            onClick={() => { decide.mutate({ draftId: draft.id, accept: true, itemIds: deleting.itemIds }); setDeleting(null); }}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>}
  </div>;
}

/** One group per kind of change, in the draft's order ("Added 4", "Moved 1"…). */
const groupLabels: Record<DraftOp, string> = { add: "Added", move: "Moved", remove: "Removed", subtask: "Sub-tasks", attach: "Attached", complete: "Completed", delete: "Deleted", horizon: "Re-sorted", keep: "Kept" };

/**
 * The review under the pill: the pending changes grouped by kind. A group opens to its changes;
 * ✓ and × decide a whole group or one change. Tasks that didn't fit ask Yes or No below.
 */
function ChangeGroups({ draft, deciding, onDecide, onOverflow }: { draft: DraftDto; deciding: boolean; onDecide(accept: boolean, itemIds?: string[]): void; onOverflow(schedule: boolean): void }) {
  const [open, setOpen] = useState<Set<DraftOp>>(new Set());
  const parentTitle = useParentTitle(draft);
  const pending = draft.items.filter(item => item.state === "pending");
  const groups = draftOps.flatMap(op => { const items = pending.filter(item => item.op === op); return items.length ? [{ op, items }] : []; });
  const toggle = (op: DraftOp) => setOpen(current => { const next = new Set(current); if (!next.delete(op)) next.add(op); return next; });
  return <div className="flex flex-col" data-coach-changes="">
    {draft.summary && <Hint className="px-2 pt-1.5 pb-1 text-xs">{draft.summary}</Hint>}
    {groups.map(({ op, items }) => {
      const Icon = opIcons[op];
      const expanded = open.has(op);
      const ids = items.map(item => item.id);
      return <section key={op} aria-label={groupLabels[op]} data-change-group={op} className="border-b border-border-subtle last:border-0">
        <div className="flex items-center gap-1 py-0.5 pr-1">
          <button type="button" aria-expanded={expanded} onClick={() => toggle(op)} data-change-group-toggle=""
            className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted">
            <ChevronRight aria-hidden="true" className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-90")} />
            <Icon aria-hidden="true" className={cn("size-3.5 shrink-0", op === "delete" ? "text-destructive" : "text-muted-foreground")} />
            <span className="font-medium">{groupLabels[op]}</span>
            <span className="text-muted-foreground">{items.length}</span>
          </button>
          <Button type="button" variant="ghost" size="icon-xs" disabled={deciding} aria-label={`Decline all ${groupLabels[op].toLowerCase()}`} title="Decline these"
            onClick={() => onDecide(false, ids)} data-draft-action="decline-group"><X /></Button>
          <Button type="button" variant="ghost" size="icon-xs" disabled={deciding} aria-label={`Accept all ${groupLabels[op].toLowerCase()}`} title="Accept these"
            onClick={() => onDecide(true, ids)} data-draft-action="accept-group"><Check /></Button>
        </div>
        {expanded && <List aria-label={`${groupLabels[op]} changes`} className="pb-1 pl-7">{items.map(item =>
          <li key={item.id} data-draft-item={item.id} data-draft-op={item.op} className="flex items-start gap-2 py-1 pr-1">
            <div className="flex min-w-0 flex-1 flex-col">
              <span className={cn("truncate text-sm", item.op === "delete" && "text-destructive line-through", (item.op === "remove" || item.op === "complete") && "line-through")}>
                <span className="sr-only">{opLabels[item.op]}: </span>{item.title}</span>
              <span className="text-xs text-muted-foreground">{draftTime(item, dayKey(new Date(item.start)) !== dayKey(new Date()), parentTitle(item))}</span>
              {item.reason && <span className="text-xs text-muted-foreground">{item.reason}</span>}
            </div>
            <Button type="button" variant="ghost" size="icon-xs" disabled={deciding} aria-label={`Decline: ${opLabels[item.op].toLowerCase()} ${item.title}`} title="Decline"
              onClick={() => onDecide(false, [item.id])} data-draft-action="decline"><X /></Button>
            <Button type="button" variant="ghost" size="icon-xs" disabled={deciding} aria-label={`Accept: ${opLabels[item.op].toLowerCase()} ${item.title}`} title="Accept"
              onClick={() => onDecide(true, [item.id])} data-draft-action="accept"><Check /></Button>
          </li>)}</List>}
      </section>;
    })}
    {draft.overflow && <div data-draft-overflow="" className="flex items-center gap-2 border-t border-border-subtle px-2 py-1.5">
      <span className="flex-1 text-sm" aria-live="polite">{overflowQuestion(draft)} <span className="text-muted-foreground">{draft.overflow.map(item => item.title).join(", ")}</span></span>
      <Button type="button" variant="outline" size="sm" disabled={deciding} onClick={() => onOverflow(false)} data-draft-action="overflow-drop">No</Button>
      <Button type="button" size="sm" disabled={deciding} onClick={() => onOverflow(true)} data-draft-action="overflow-schedule">Yes</Button>
    </div>}
  </div>;
}

function DocumentChip({ document, disabled, onRemove }: { document: CoachDocumentDto; disabled: boolean; onRemove(): void }) {
  const Icon = document.kind === "image" ? Image : FileText;
  return <li className="flex max-w-56 items-center gap-1 rounded-md border border-border bg-muted py-0.5 pr-0.5 pl-1.5 text-xs" data-coach-document={document.id}>
    <Icon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
    <span className="truncate" title={document.name}>{document.name}</span>
    <Button type="button" variant="ghost" size="icon-xs" aria-label={`Remove ${document.name}`} disabled={disabled} onClick={onRemove}><X /></Button>
  </li>;
}
