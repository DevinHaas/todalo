import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { STATEMENT_MAX, patternMutations, patternQuery, type PatternDto } from "./patterns";
import { FormError } from "./goal-views";
import { Button, Hint, Input } from "./ui";

const learnedOn = (iso: string) => new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(new Date(iso));

/**
 * Goals ticket 24: Settings › Coach › Patterns. Every pattern the Coach uses,
 * with its evidence and where it came from; edit or delete any. Learn now
 * (with a provider) runs the same learning as finishing a Weekly review.
 * Hidden without a provider and without patterns: no Coach noise.
 */
export function CoachPatterns({ userId, connected }: { userId: string; connected: boolean }) {
  const cache = useQueryClient();
  const query = useQuery(patternQuery(userId));
  const writes = patternMutations(cache, userId);
  const [note, setNote] = useState<string | null>(null);
  const learn = useMutation({ mutationFn: writes.learn, onMutate: () => setNote(null), onSuccess: result => setNote(result.learned ? `Learned ${result.learned} new pattern${result.learned > 1 ? "s" : ""}.` : result.message ?? null), meta: { action: () => "learn patterns" } });
  const list = query.data?.patterns ?? [];
  if (!connected && !list.length) return null;
  return <section className="flex flex-col gap-2" aria-labelledby="coach-patterns-title" data-coach-patterns="">
    <div className="flex flex-wrap items-center gap-2">
      <h3 id="coach-patterns-title" className="flex-1 text-sm font-semibold">Patterns</h3>
      {connected && <Button type="button" size="sm" variant="outline" data-pattern-action="learn" disabled={learn.isPending} onClick={() => learn.mutate()}>
        {learn.isPending ? "Learning…" : "Learn now"}</Button>}
    </div>
    <Hint>What the Coach learned about how you work, from your goal tasks (done, scheduled, moved) and progress ratings. It learns after each Weekly review and uses only the patterns listed here.</Hint>
    <div aria-live="polite">
      {note && <p role="status" className="text-xs-plus text-muted-foreground" data-pattern-note="">{note}</p>}
      {(learn.error ?? query.error) && <FormError>{(learn.error ?? query.error)!.message}</FormError>}
    </div>
    {list.length > 0 ? <ul className="flex flex-col gap-2" aria-label="Patterns">
      {list.map(pattern => <PatternRow key={`${pattern.id}:${pattern.statement}`} userId={userId} pattern={pattern} />)}
    </ul> : query.data && <p className="text-xs-plus text-muted-foreground" data-pattern-empty="">No patterns yet.</p>}
  </section>;
}

function PatternRow({ userId, pattern }: { userId: string; pattern: PatternDto }) {
  const cache = useQueryClient();
  const writes = patternMutations(cache, userId);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(pattern.statement);
  const save = useMutation({ mutationFn: writes.update, onSuccess: () => setEditing(false), meta: { action: () => "save the pattern" } });
  const remove = useMutation({ mutationFn: () => writes.remove(pattern.id), meta: { action: () => "delete the pattern" } });
  const pending = save.isPending || remove.isPending;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (text.trim() && text.trim() !== pattern.statement) save.mutate({ id: pattern.id, statement: text.trim() });
    else setEditing(false);
  }

  return <li className="rounded-lg border border-border bg-card px-3 py-2.5 text-card-foreground" data-pattern={pattern.id} tabIndex={-1}>
    {editing ? <form className="flex flex-wrap items-center gap-2" onSubmit={submit}>
      <Input aria-label="Pattern" className="min-w-48 flex-1" value={text} autoFocus maxLength={STATEMENT_MAX} disabled={pending}
        onChange={event => setText(event.target.value)} onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); setText(pattern.statement); setEditing(false); } }} />
      <Button type="submit" size="sm" disabled={pending || !text.trim()}>Save</Button>
      <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => { setText(pattern.statement); setEditing(false); }}>Cancel</Button>
    </form> : <div className="flex items-start gap-2">
      <p className="min-w-0 flex-1 text-sm font-medium" data-pattern-statement="">{pattern.statement}</p>
      <Button type="button" size="sm" variant="ghost" data-pattern-action="edit" disabled={pending} onClick={() => setEditing(true)}>Edit</Button>
      <Button type="button" size="sm" variant="ghost" data-pattern-action="delete" disabled={pending} onClick={() => remove.mutate()}>Delete</Button>
    </div>}
    <p className="mt-1 text-xs-plus text-muted-foreground" data-pattern-evidence="">{pattern.evidence}</p>
    <p className="mt-0.5 text-xs text-muted-foreground" data-pattern-source="">
      Learned {learnedOn(pattern.learnedAt)} · {pattern.source}{pattern.editedAt && ` · edited by you ${learnedOn(pattern.editedAt)}`}
    </p>
    {(save.error ?? remove.error) && <FormError>{(save.error ?? remove.error)!.message}</FormError>}
  </li>;
}
