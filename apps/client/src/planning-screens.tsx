// Goals ticket 23: the planning session. Opened from the Season page, the
// Weekly review or a goal page; only with a Coach provider connected (without
// one there is no button, dialog or key). The user rambles or types about a
// goal, answers the Coach's multiple-choice questions ("Something else…" types
// or speaks), and ends with a Draft of new tasks with times and milestones,
// decided here and shown dashed on the schedule. The transcript lives only in
// this dialog: closing it before the draft keeps nothing.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { coach, coachReads, goalReads, seasonReads } from "./runtime";
import { coachKeys, draftMutations, type DraftsDto, type PlanningDto, type PlanningInput, type PlanningQuestionDto, type PlanningSource } from "./coach";
import { DraftPanel } from "./draft-views";
import { GoalIcon } from "./goal-views";
import { VoiceContext } from "./ritual-screens";
import { localZone } from "./seasons";
import { reportCoachError } from "./coach-errors";
import {
  Button, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Field, FieldLabel, Hint, Label, Progress,
  RadioGroup, RadioGroupItem, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Spinner, Textarea,
} from "./ui";

let state = { open: false, goalId: null as string | null, source: "goal" as PlanningSource, key: 0 };
const watchers = new Set<() => void>();
const planningState = { get: () => state, subscribe: (watcher: () => void) => { watchers.add(watcher); return () => { watchers.delete(watcher); }; } };
const set = (next: Partial<typeof state>) => { state = { ...state, ...next }; watchers.forEach(watcher => watcher()); };

/** Opens a planning session about `goalId` (else the season's first primary goal). */
export const openPlanning = ({ goalId, source }: { goalId?: string; source: PlanningSource }) => set({ open: true, goalId: goalId ?? null, source, key: state.key + 1 });
const closePlanning = () => set({ open: false });

/** Whether a Coach provider is connected: every entry point shows only then. */
export const useCoachConnected = (userId: string) => Boolean(useQuery(coachReads.provider(userId)).data?.provider);

export function PlanningHost({ userId }: { userId: string }) {
  const { open, goalId, source, key } = useSyncExternalStore(planningState.subscribe, planningState.get);
  const connected = useCoachConnected(userId);
  if (!connected) return null;
  return <Dialog open={open} onOpenChange={(next) => { if (!next) closePlanning(); }}>
    <DialogContent size="xl" data-planning="">{open && <PlanningSession key={key} userId={userId} initialGoal={goalId} source={source} />}</DialogContent>
  </Dialog>;
}

const OTHER = "__other";

function PlanningSession({ userId, initialGoal, source }: { userId: string; initialGoal: string | null; source: PlanningSource }) {
  const cache = useQueryClient();
  const goals = useQuery(goalReads.list(userId)).data?.goals ?? [];
  const season = useQuery(seasonReads.current(userId)).data?.season;
  const drafts = useQuery(coachReads.drafts(userId));
  const writes = useMemo(() => draftMutations(coach, cache, userId), [cache, userId]);
  const firstPrimary = season?.goals.find(goal => goal.tier === "primary" && !goal.archived)?.goalId;
  const [goalId, setGoalId] = useState<string | null>(initialGoal);
  const chosen = goalId ?? firstPrimary ?? goals[0]?.id ?? null;
  const [ramble, setRamble] = useState("");
  const [turns, setTurns] = useState<PlanningInput["turns"]>([]);
  const [question, setQuestion] = useState<PlanningQuestionDto | null>(null);
  const [choice, setChoice] = useState("");
  const [other, setOther] = useState("");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // Reopened with a plan draft still to decide: show it first.
  const waiting = drafts.data?.drafts.find(draft => draft.kind === "plan" && draft.items.some(item => item.state === "pending"));
  // Once, when the drafts first load: after that (Plan again, a new session) it is not offered again.
  const offered = useRef(false);
  useEffect(() => {
    if (!drafts.data || offered.current) return;
    offered.current = true;
    if (waiting && !ramble && !turns.length) setDraftId(waiting.id);
  }, [drafts.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const turn = useMutation({
    mutationFn: (input: PlanningInput) => coach.planning(localZone(), input),
    onMutate: () => setMessage(null),
    onSuccess: (result: PlanningDto, input) => {
      if (reportCoachError(result.error, { retry: () => turn.mutate(input) })) return;
      if (result.message) { setMessage(result.message); return; }
      setTurns(input.turns);
      setChoice(""); setOther("");
      if (result.question) { setQuestion(result.question); return; }
      setQuestion(null);
      const drafted = result.draft;
      if (drafted) {
        // In the cache at once (replacing the day's earlier plan, as the server does), so the dialog shows it.
        cache.setQueryData<DraftsDto>(coachKeys.drafts(userId), current => ({ drafts: [...(current?.drafts ?? []).filter(item => !(item.kind === "plan" && item.period === drafted.period)), drafted] }));
        setDraftId(drafted.id);
      }
    },
    meta: { action: () => "plan with the Coach" },
  });
  const decide = useMutation({ mutationFn: writes.decide, meta: { action: ({ accept }: { accept: boolean }) => accept ? "accept the plan" : "decline the plan" } });
  // Ticket 28: Yes or No to the overflow; Yes's day draft shows on Today (or the week it lands in).
  const overflow = useMutation({ mutationFn: writes.overflow, onSuccess: (result) => setMessage(result.message ?? result.next?.summary ?? null), meta: { action: ({ schedule }: { schedule: boolean }) => schedule ? "schedule the tasks that didn't fit" : "drop the tasks that didn't fit" } });
  const send = (finish = false) => {
    if (!chosen || !ramble.trim() || turn.isPending) return;
    const answer = choice === OTHER ? other.trim() : choice;
    const next = question && answer ? [...turns, { question: question.text, answer }] : turns;
    turn.mutate({ goalId: chosen, source, ramble: ramble.trim(), turns: next, finish });
  };
  const restart = () => { setDraftId(null); setQuestion(null); setTurns([]); setChoice(""); setOther(""); setMessage(null); };
  const goal = goals.find(item => item.id === chosen);
  const draft = draftId ? drafts.data?.drafts.find(item => item.id === draftId) ?? null : null;
  const thinking = turn.isPending && <span role="status" className="flex items-center gap-1.5 text-sm text-muted-foreground"><Spinner />The Coach is thinking…</span>;
  const error = message && <Hint role="alert" className="text-destructive">{message}</Hint>;

  const header = <DialogHeader>
    <DialogTitle className="flex items-center gap-2"><Sparkles aria-hidden="true" className="size-4 text-brand" />Plan with the Coach</DialogTitle>
    <DialogDescription>Talk about a goal; the Coach asks a few questions and drafts new tasks and milestones. Nothing changes until you accept.</DialogDescription>
  </DialogHeader>;

  // Wait for the drafts: a plan still to decide opens first.
  if (drafts.isPending) return <>{header}<DialogBody><span role="status" className="flex items-center gap-1.5 text-sm text-muted-foreground"><Spinner />Loading…</span></DialogBody></>;
  if (draftId) return <>{header}<DialogBody className="flex flex-col gap-3" data-planning-step="draft">
    {draft && (draft.items.some(item => item.state === "pending") || draft.overflow)
      ? <DraftPanel scope="week" draft={draft} drafting={false} deciding={decide.isPending || overflow.isPending} message={null} onDecide={(accept, itemIds) => decide.mutate({ draftId: draft.id, accept, itemIds })}
        onOverflow={(schedule) => overflow.mutate({ draftId: draft.id, schedule })} />
      : <Hint role="status">Plan decided. Accepted tasks are on your schedule and milestones on the goal.</Hint>}
    {message && <Hint role="status">{message}</Hint>}
  </DialogBody><DialogFooter>
    <Button type="button" variant="outline" onClick={restart} data-planning-action="restart">Plan again</Button>
    <Button type="button" onClick={closePlanning}>Close</Button>
  </DialogFooter></>;

  if (!question) return <>{header}<DialogBody className="flex flex-col gap-4" data-planning-step="ramble">
    <Field>
      <FieldLabel>Goal</FieldLabel>
      <Select items={goals.map(item => ({ value: item.id, label: item.title }))} value={chosen ?? ""} onValueChange={(value) => { if (value) setGoalId(value as string); }}>
        <SelectTrigger aria-label="Goal to plan" className="max-w-full"><SelectValue placeholder="Choose a goal" /></SelectTrigger>
        <SelectContent>{goals.map(item => <SelectItem key={item.id} value={item.id}><GoalIcon color={item.color} icon={item.icon} />{item.title}</SelectItem>)}</SelectContent>
      </Select>
      {!goals.length && <Hint>Add a goal first, on the Season page or in the sidebar.</Hint>}
    </Field>
    <Field>
      <FieldLabel htmlFor="planning-ramble">What's on your mind about {goal?.title ?? "this goal"}?</FieldLabel>
      <Textarea id="planning-ramble" rows={5} maxLength={5_000} autoFocus value={ramble} placeholder="Ramble: where you are, what's in the way, what you'd like to happen. Type or speak."
        onChange={event => setRamble(event.target.value)} />
      <VoiceContext onText={text => setRamble(current => [current.trim(), text].filter(Boolean).join(" "))} />
    </Field>
    {error}{thinking}
  </DialogBody><DialogFooter>
    <Button type="button" variant="outline" disabled={!chosen || !ramble.trim() || turn.isPending} onClick={() => send(true)} data-planning-action="draft-now">Draft now</Button>
    <Button type="button" disabled={!chosen || !ramble.trim() || turn.isPending} onClick={() => send()} data-planning-action="next">Continue</Button>
  </DialogFooter></>;

  const answered = choice === OTHER ? Boolean(other.trim()) : Boolean(choice);
  return <>{header}<DialogBody className="flex flex-col gap-4" data-planning-step="question">
    <Progress aria-label={`Question ${question.step} of up to ${question.total}`} value={Math.round(question.step / question.total * 100)} />
    <Hint className="text-xs">Question {question.step} of up to {question.total}{goal ? ` · ${goal.title}` : ""}</Hint>
    <h3 className="text-sm font-semibold" id="planning-question">{question.text}</h3>
    <RadioGroup aria-labelledby="planning-question" value={choice} onValueChange={(value) => setChoice(value as string)} className="gap-2">
      {question.options.map(option => <Label key={option} className="flex cursor-pointer items-center gap-2 font-normal"><RadioGroupItem value={option} />{option}</Label>)}
      <Label className="flex cursor-pointer items-center gap-2 font-normal"><RadioGroupItem value={OTHER} data-planning-option="other" />Something else…</Label>
    </RadioGroup>
    {choice === OTHER && <Field>
      <Textarea aria-label="Your answer" rows={3} maxLength={2_000} autoFocus value={other} placeholder="Type or speak your answer." onChange={event => setOther(event.target.value)} />
      <VoiceContext onText={text => setOther(current => [current.trim(), text].filter(Boolean).join(" "))} />
    </Field>}
    {error}{thinking}
  </DialogBody><DialogFooter>
    <Button type="button" variant="outline" disabled={turn.isPending} onClick={() => send(true)} data-planning-action="draft-now">Draft now</Button>
    <Button type="button" disabled={!answered || turn.isPending} onClick={() => send()} data-planning-action="next">Next</Button>
  </DialogFooter></>;
}
