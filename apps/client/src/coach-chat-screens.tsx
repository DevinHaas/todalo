// Goals ticket 22: the Coach chat in the right sidebar. Only with a Coach
// provider connected: without one there is no button, panel or key.
// Ticket 29: talking moved to the Coach bar (coach-bar.tsx); the sidebar is
// the read-only record: what the user asked, the documents, and every task the
// pending changes affect (added, moved, removed, sub-tasks, attachments), each
// linked to its task.
import { useMemo, useSyncExternalStore } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Sparkles, Trash2, X } from "lucide-react";
import { coach, coachReads, reads } from "./runtime";
import { coachKeys, type DraftItemDto } from "./coach";
import { draftTime, opIcons, opLabels } from "./draft-views";
import { focusCoachBar } from "./coach-bar";
import { taskPath } from "./links";
import { Button, Hint, List, RightSidebar, cn } from "./ui";

let state = { open: false };
const watchers = new Set<() => void>();
const set = (next: Partial<typeof state>) => { state = { ...state, ...next }; watchers.forEach(watcher => watcher()); };
const chatState = { get: () => state, subscribe: (watcher: () => void) => { watchers.add(watcher); return () => { watchers.delete(watcher); }; } };

/** Ticket 29: talking to the Coach is the bar: focuses it, `prompt` pre-filled (e.g. a recommendation's "Chat with coach"). */
export const openCoachChat = (prompt?: string) => focusCoachBar(prompt);
export const toggleCoachSidebar = () => set({ open: !state.open });
export const closeCoachChat = () => set({ open: false });

/** Whether the Coach can chat (a provider is connected). */
function useConnected(userId: string) {
  return Boolean(useQuery(coachReads.provider(userId)).data?.provider);
}

/** The toolbar's Coach button: shows and hides the sidebar. */
export function CoachChatButton({ userId }: { userId: string }) {
  const { open } = useSyncExternalStore(chatState.subscribe, chatState.get);
  if (!useConnected(userId)) return null;
  return <Button type="button" variant={open ? "secondary" : "ghost"} size="icon-sm" aria-label="Coach sidebar" aria-pressed={open} title="Coach sidebar"
    data-coach-chat-toggle="" onClick={toggleCoachSidebar}><Sparkles className="text-brand" /></Button>;
}

export function CoachChatHost({ userId }: { userId: string }) {
  const { open } = useSyncExternalStore(chatState.subscribe, chatState.get);
  const connected = useConnected(userId);
  if (!open || !connected) return null;
  return <CoachChat userId={userId} />;
}

function CoachChat({ userId }: { userId: string }) {
  const cache = useQueryClient();
  const chat = useQuery(coachReads.chat(userId));
  const drafts = useQuery(coachReads.drafts(userId));
  // Every owned task, for the titles of the tasks a change goes under.
  const tasks = useQuery(reads.today(userId)).data?.tasks;
  const clear = useMutation({
    mutationFn: () => coach.clearChat(),
    onSuccess: (result) => cache.setQueryData(coachKeys.chat(userId), result),
    meta: { action: () => "clear the Coach chat" },
  });
  const asked = (chat.data?.messages ?? []).filter(item => item.role === "user");
  const documents = chat.data?.documents ?? [];
  const pending = useMemo(() => (drafts.data?.drafts ?? []).filter(draft => draft.kind === "chat")
    .flatMap(draft => draft.items.filter(item => item.state === "pending").map(item => ({ item, draft }))), [drafts.data]);
  const title = (id: string | undefined) => tasks?.find(task => task.id === id)?.title;

  return <RightSidebar className="ui w-plan! pr-3 max-md:fixed max-md:inset-0 max-md:z-20 max-md:w-full! max-md:bg-background" aria-label="Coach" data-coach-chat=""
    title={<span className="flex items-center gap-1.5"><Sparkles aria-hidden="true" className="size-4 text-brand" />Coach</span>}
    actions={<>
      {(asked.length > 0 || documents.length > 0) && <Button type="button" variant="ghost" size="icon-sm" aria-label="New conversation" title="New conversation (also removes the documents)"
        disabled={clear.isPending} onClick={() => clear.mutate()} data-coach-chat-action="clear"><Trash2 /></Button>}
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Close Coach sidebar" onClick={closeCoachChat}><X /></Button>
    </>}>
    <div className="flex flex-col gap-4 pb-2">
      {!asked.length && !pending.length && <Hint className="py-2">Talk to the Coach in the bar at the bottom. What you ask and the tasks its changes touch are listed here.</Hint>}
      {pending.length > 0 && <section aria-label="Pending changes" className="flex flex-col gap-1">
        <h3 className="text-xs font-semibold text-muted-foreground">Pending changes</h3>
        <List aria-label="Tasks the changes affect">{pending.map(({ item, draft }) => <AffectedTask key={item.id} item={item}
          parent={item.parentId ? title(item.parentId) : draft.items.find(other => other.id === item.parentItemId)?.title} />)}</List>
        <Hint className="text-xs">Keep or drop them in the Coach bar.</Hint>
      </section>}
      {documents.length > 0 && <section aria-label="Documents" className="flex flex-col gap-1">
        <h3 className="text-xs font-semibold text-muted-foreground">Documents</h3>
        <List>{documents.map(document => <li key={document.id} className="flex items-center gap-1.5 py-0.5 text-sm"><FileText aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" /><span className="truncate">{document.name}</span></li>)}</List>
      </section>}
      {asked.length > 0 && <section aria-label="What you asked" className="flex flex-col gap-1">
        <h3 className="text-xs font-semibold text-muted-foreground">What you asked</h3>
        <List className="flex flex-col gap-1.5">{asked.map(item => <li key={item.id} data-chat-message="user"
          className="whitespace-pre-wrap rounded-lg bg-brand-tint px-2.5 py-1.5 text-sm text-brand-tint-foreground">{item.content}</li>)}</List>
      </section>}
    </div>
  </RightSidebar>;
}

/** One change's task: linked when it exists (a sub-task's or attachment's parent when the task is new). */
function AffectedTask({ item, parent }: { item: DraftItemDto; parent?: string }) {
  const Icon = opIcons[item.op];
  const target = item.taskId ?? item.parentId;
  const name = item.op === "attach" ? `${item.title} → ${parent ?? "a new task"}` : item.title;
  return <li className="flex items-start gap-2 border-t border-border-subtle py-1.5" data-affected-task={item.id} data-draft-op={item.op}>
    <Icon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
    <div className="flex min-w-0 flex-1 flex-col">
      <span className={cn("text-sm", (item.op === "remove" || item.op === "complete" || item.op === "delete") && "line-through", item.op === "delete" && "text-destructive")}><span className="sr-only">{opLabels[item.op]}: </span>
        {target ? <Link to={taskPath(target)} className="hover:underline">{name}</Link> : name}</span>
      <span className="text-xs text-muted-foreground">{draftTime(item, true, parent)}</span>
    </div>
  </li>;
}
