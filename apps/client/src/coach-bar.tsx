// Goals ticket 29: the Coach bar, floating at the bottom of every main view.
// All talking to the Coach happens here: type a question or a change, attach
// documents (paperclip, drop, paste), read the short reply, and keep or drop
// the changes it drafts ("4 added, 1 moved, 1 removed", × declines, ✓ accepts;
// Review lists them one by one). The changes show dashed in place meanwhile
// (pending-changes.tsx, the calendar); nothing is written until accepted. The
// right sidebar (coach-chat-screens.tsx) is the read-only record.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ClipboardEvent, type DragEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUp, Check, ChevronDown, FileText, Image, Paperclip, Sparkles, X } from "lucide-react";
import { coach, coachReads, goalReads } from "./runtime";
import { coachKeys, draftCounts, draftMutations, type CoachChatDto, type CoachDocumentDto } from "./coach";
import { documentProblem } from "../../../packages/server/src/coach-documents";
import { DraftPanel } from "./draft-views";
import { goalColorValue } from "./goals";
import { localZone } from "./seasons";
import { modalOpen } from "./keyboard";
import { reportCoachError } from "./coach-errors";
import { Button, Hint, Spinner, Textarea, cn } from "./ui";

/** Accepted in the picker (the server checks again, by kind). */
const ACCEPT = ".pdf,.docx,.txt,.md,.markdown,.csv,.png,.jpg,.jpeg,.gif,.webp,application/pdf,text/*,image/png,image/jpeg,image/gif,image/webp";

let state = { focus: 0, prompt: null as string | null };
const watchers = new Set<() => void>();
const barState = { get: () => state, subscribe: (watcher: () => void) => { watchers.add(watcher); return () => { watchers.delete(watcher); }; } };
/** Focuses the bar's field; `prompt` pre-fills it (a recommendation's "Chat with coach") for the user to edit and send. */
export const focusCoachBar = (prompt?: string) => { state = { focus: state.focus + 1, prompt: prompt ?? null }; watchers.forEach(watcher => watcher()); };

/** Only with a Coach provider connected: without one there is no bar. */
export function CoachBar({ userId }: { userId: string }) {
  const connected = Boolean(useQuery(coachReads.provider(userId)).data?.provider);
  return connected ? <Bar userId={userId} /> : null;
}

function Bar({ userId }: { userId: string }) {
  const cache = useQueryClient();
  const { focus, prompt } = useSyncExternalStore(barState.subscribe, barState.get);
  const chat = useQuery(coachReads.chat(userId));
  const drafts = useQuery(coachReads.drafts(userId));
  const goals = useQuery(goalReads.list(userId));
  const writes = useMemo(() => draftMutations(coach, cache, userId), [cache, userId]);
  const [text, setText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [replyOpen, setReplyOpen] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [dragging, setDragging] = useState(false);
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
      if (result.draft) { void cache.invalidateQueries({ queryKey: coachKeys.drafts(userId) }); setReviewing(false); }
      setText(current => current === body ? "" : current);
    },
    onError: () => setReplyOpen(false),
    meta: { action: () => "send your message to the Coach" },
  });
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
  const decide = useMutation({ mutationFn: writes.decide, meta: { action: ({ accept }: { accept: boolean }) => accept ? "accept the changes" : "decline the changes" } });
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
        <DraftPanel scope="week" draft={draft} drafting={false} deciding={decide.isPending || overflow.isPending} message={null}
          onDecide={(accept, itemIds) => decide.mutate({ draftId: draft.id, accept, itemIds })} onOverflow={(schedule) => overflow.mutate({ draftId: draft.id, schedule })} />
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
            onClick={() => decide.mutate({ draftId: draft.id, accept: false })} data-draft-action="decline-all"><X /></Button>
          <Button type="button" size="icon" className="rounded-full" aria-label="Accept all changes" title="Accept all" disabled={decide.isPending}
            onClick={() => decide.mutate({ draftId: draft.id, accept: true })} data-draft-action="accept-all">{decide.isPending ? <Spinner /> : <Check />}</Button>
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
