// Goals ticket 22: the Coach chat in the right sidebar. Only with a Coach
// provider connected: without one there is no button, panel or key. A change
// the Coach proposes arrives as a Draft (kind "chat") shown under its reply
// and dashed on the schedule; nothing changes until it is accepted.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Trash2, X } from "lucide-react";
import { coach, coachReads } from "./runtime";
import { coachKeys, draftMutations, type ChatMessageDto, type CoachChatDto } from "./coach";
import { DraftPanel } from "./draft-views";
import { localZone } from "./seasons";
import { Button, Hint, List, RightSidebar, Spinner, Textarea, cn } from "./ui";

let state = { open: false, prompt: null as string | null, focus: 0 };
const watchers = new Set<() => void>();
const set = (next: Partial<typeof state>) => { state = { ...state, ...next }; watchers.forEach(watcher => watcher()); };
const chatState = { get: () => state, subscribe: (watcher: () => void) => { watchers.add(watcher); return () => { watchers.delete(watcher); }; } };

/**
 * Opens the Coach chat and focuses its composer; `prompt` pre-fills it (e.g.
 * a recommendation's "Chat with coach"), for the user to edit and send.
 */
export const openCoachChat = (prompt?: string) => set({ open: true, prompt: prompt ?? null, focus: state.focus + 1 });
export const closeCoachChat = () => set({ open: false });
export const coachChatOpen = () => state.open;

/** Whether the Coach can chat (a provider is connected). */
function useConnected(userId: string) {
  return Boolean(useQuery(coachReads.provider(userId)).data?.provider);
}

/** The toolbar's Coach button: opens and closes the chat. */
export function CoachChatButton({ userId }: { userId: string }) {
  const { open } = useSyncExternalStore(chatState.subscribe, chatState.get);
  if (!useConnected(userId)) return null;
  return <Button type="button" variant={open ? "secondary" : "ghost"} size="icon-sm" aria-label="Coach chat" aria-pressed={open} title="Coach chat"
    data-coach-chat-toggle="" onClick={() => open ? closeCoachChat() : openCoachChat()}><Sparkles className="text-brand" /></Button>;
}

export function CoachChatHost({ userId }: { userId: string }) {
  const { open, prompt, focus } = useSyncExternalStore(chatState.subscribe, chatState.get);
  const connected = useConnected(userId);
  if (!open || !connected) return null;
  return <CoachChat userId={userId} prompt={prompt} focus={focus} />;
}

function CoachChat({ userId, prompt, focus }: { userId: string; prompt: string | null; focus: number }) {
  const cache = useQueryClient();
  const chat = useQuery(coachReads.chat(userId));
  const drafts = useQuery(coachReads.drafts(userId));
  const writes = useMemo(() => draftMutations(coach, cache, userId), [cache, userId]);
  const [text, setText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  // Every open (also from a recommendation) focuses the composer, pre-filled when asked.
  useEffect(() => {
    if (prompt) setText(prompt);
    composer.current?.focus();
  }, [focus, prompt]);
  const send = useMutation({
    mutationFn: (body: string) => coach.sendChat(localZone(), body),
    onMutate: () => setMessage(null),
    onSuccess: (result: CoachChatDto, body) => {
      if (result.message) { setMessage(result.message); return; }
      cache.setQueryData(coachKeys.chat(userId), { messages: result.messages });
      if (result.draft) void cache.invalidateQueries({ queryKey: coachKeys.drafts(userId) });
      setText(current => current === body ? "" : current);
    },
    meta: { action: () => "send your message to the Coach" },
  });
  const clear = useMutation({
    mutationFn: () => coach.clearChat(),
    onSuccess: (result) => { cache.setQueryData(coachKeys.chat(userId), result); setMessage(null); },
    meta: { action: () => "clear the Coach chat" },
  });
  const decide = useMutation({ mutationFn: writes.decide, meta: { action: ({ accept }: { accept: boolean }) => accept ? "accept the draft" : "decline the draft" } });
  const messages: ChatMessageDto[] = chat.data?.messages ?? [];
  const pendingText = send.isPending ? send.variables : null;
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [messages.length, pendingText]);
  const submit = () => { const body = text.trim(); if (body && !send.isPending) send.mutate(body); };
  const open = new Map((drafts.data?.drafts ?? []).filter(draft => draft.kind === "chat").map(draft => [draft.id, draft]));

  return <RightSidebar className="ui w-plan! pr-3 max-md:fixed max-md:inset-0 max-md:z-20 max-md:w-full! max-md:bg-background" aria-label="Coach chat" data-coach-chat=""
    title={<span className="flex items-center gap-1.5"><Sparkles aria-hidden="true" className="size-4 text-brand" />Coach</span>}
    actions={<>
      {messages.length > 0 && <Button type="button" variant="ghost" size="icon-sm" aria-label="New conversation" title="New conversation" disabled={clear.isPending || send.isPending}
        onClick={() => clear.mutate()} data-coach-chat-action="clear"><Trash2 /></Button>}
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Close Coach chat" onClick={closeCoachChat}><X /></Button>
    </>}>
    <List aria-label="Conversation" className="flex flex-col gap-2 pb-1" aria-live="polite">
      {!messages.length && !pendingText && <li><Hint className="py-2">Ask the Coach about your goals or your plan, e.g. “What should I change this week?”. It never changes anything itself: proposals arrive as a draft you accept or decline.</Hint></li>}
      {messages.map(item => {
        const draft = item.draftId ? open.get(item.draftId) : undefined;
        const pending = draft?.items.some(row => row.state === "pending");
        return <li key={item.id} className="flex flex-col gap-2" data-chat-message={item.role}>
          <Bubble role={item.role} content={item.content} />
          {draft && pending ? <DraftPanel scope="week" draft={draft} drafting={false} deciding={decide.isPending} message={null}
            onDecide={(accept, itemIds) => decide.mutate({ draftId: draft.id, accept, itemIds })} />
            : item.draftId && <Hint className="text-xs">This draft was decided or replaced.</Hint>}
        </li>;
      })}
      {pendingText && <li className="flex flex-col gap-2"><Bubble role="user" content={pendingText} />
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status"><Spinner />The Coach is thinking…</span></li>}
    </List>
    <div ref={end} />
    <form className="sticky bottom-0 mt-auto flex flex-col gap-1.5 border-t border-border-subtle bg-background py-2" data-coach-chat-composer=""
      onSubmit={(event) => { event.preventDefault(); submit(); }}>
      {message && <Hint className="text-xs text-destructive" role="alert">{message}</Hint>}
      <Textarea ref={composer} rows={3} maxLength={4_000} aria-label="Message the Coach" placeholder="Ask the Coach…" value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          // Enter sends, Shift+Enter is a new line, Escape closes the chat.
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); }
          if (event.key === "Escape") { event.preventDefault(); closeCoachChat(); }
        }} />
      <div className="flex items-center justify-between gap-2">
        <Hint className="text-xs">Enter to send, Shift+Enter for a new line</Hint>
        <Button type="submit" size="sm" disabled={!text.trim() || send.isPending} data-coach-chat-action="send">{send.isPending && <Spinner />}Send</Button>
      </div>
    </form>
  </RightSidebar>;
}

function Bubble({ role, content }: { role: ChatMessageDto["role"]; content: string }) {
  return <div className={cn("max-w-[92%] whitespace-pre-wrap rounded-lg px-2.5 py-1.5 text-sm", role === "user" ? "self-end bg-brand-tint text-brand-tint-foreground" : "self-start bg-muted")}>
    <span className="sr-only">{role === "user" ? "You: " : "Coach: "}</span>{content}
  </div>;
}
