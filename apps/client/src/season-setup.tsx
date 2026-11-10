// The season setup: starting a season is five short steps, one question each —
// what the season is about, how long it runs, which goals it focuses on (a
// switch per goal, Primary or Secondary; with a Coach connected, it suggests
// goals from the first answer, beside the user's own), where each goal starts
// from (in the user's words), then a review. Nothing is written until "Start
// season"; the screen then saves the season, any new goals and their starting
// points through the ordinary season and goal calls. Pure view: the Coach call
// comes in as `suggest`.
import { useState, type KeyboardEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Plus, Sparkles } from "lucide-react";
import { nextGoalColor, type GoalColor, type GoalDto, type GoalIcon as GoalIconName } from "./goals";
import { FormError, GoalIcon } from "./goal-views";
import { primaryGuideline, tooManyPrimary, type SeasonTier } from "./seasons";
import type { SeasonSetupDto, SeasonSetupInput } from "./coach";
import {
  Badge, Button, Field, FieldLabel, FieldLegend, FieldSet, Hint, Input, Label, List, ListRow, Progress, RadioGroup, RadioGroupItem, Spinner, Switch, Textarea,
  ToggleGroup, ToggleGroupItem, cn,
} from "./ui";

/** A goal the season could focus on: suggested by the Coach, one of the user's own, or added here. */
interface Candidate {
  key: number; source: "coach" | "existing" | "new"; goalId?: string;
  title: string; color: GoalColor; icon: GoalIconName; tier: SeasonTier; target: string;
  /** The Coach's open question about where it stands today ("" without one). */
  question: string;
  included: boolean; baseline: string;
}
export interface SeasonPlan {
  intention: string; startDate: string; lengthDays: number;
  /** goalId for one of the user's goals; without, a new goal is created. */
  goals: { goalId?: string; title: string; color: GoalColor; icon: GoalIconName; tier: SeasonTier; target: string; baseline?: string }[];
}

const STEPS = ["Focus", "Length", "Goals", "Starting point", "Review"] as const;
const LENGTHS = [
  { days: 28, label: "4 weeks", note: "A focused sprint" },
  { days: 42, label: "6 weeks", note: "A short push" },
  { days: 56, label: "8 weeks", note: "Room for a new habit" },
  { days: 84, label: "12 weeks", note: "A full season" },
] as const;
const EXAMPLES = ["Get fit for a race", "Ship a side project", "Learn a language", "Finish the book I'm writing"];

const localToday = () => { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10); };
const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const weekday = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`)).getUTCDay();
const nextMonday = (today: string) => addDays(today, ((8 - weekday(today)) % 7) || 7);
const longDay = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const formatDay = (date: string) => longDay.format(Date.parse(`${date}T00:00:00Z`));

let keys = 0;
const fromGoal = (goal: GoalDto): Candidate => ({ key: ++keys, source: "existing", goalId: goal.id, title: goal.title, color: goal.color, icon: goal.icon, tier: "secondary", target: "", question: "", included: false, baseline: "" });

export function SeasonSetup({ existing, suggest, onStart, write }: {
  /** The user's goals (not archived), offered beside the Coach's suggestions. */
  existing: GoalDto[];
  /** The Coach's suggestions; undefined without a connected provider (goals are then picked and added by hand). */
  suggest?: (input: SeasonSetupInput) => Promise<SeasonSetupDto>;
  onStart(plan: SeasonPlan): Promise<unknown>;
  write: { pending: boolean; error: string | null };
}) {
  const today = localToday();
  const [step, setStep] = useState(0);
  const [intention, setIntention] = useState("");
  const [lengthDays, setLengthDays] = useState(84);
  const [startChoice, setStartChoice] = useState<"today" | "monday" | "date">("today");
  const [startDate, setStartDate] = useState(today);
  const [goals, setGoals] = useState<Candidate[]>(() => existing.map(fromGoal));
  // The focus and length the shown suggestions were made for: changing either asks again.
  const [suggestedFor, setSuggestedFor] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ title: "", target: "" });

  const start = startChoice === "today" ? today : startChoice === "monday" ? nextMonday(today) : startDate;
  const chosen = goals.filter(goal => goal.included);
  const ready = chosen.length > 0 && chosen.every(goal => goal.target.trim());
  const patch = (key: number, change: Partial<Candidate>) => setGoals(list => list.map(goal => goal.key === key ? { ...goal, ...change } : goal));

  async function askCoach() {
    if (!suggest) return;
    const asked = `${lengthDays}:${intention.trim()}`;
    setSuggesting(true); setMessage(null);
    try {
      const result = await suggest({ intention: intention.trim(), lengthDays });
      if (result.goals.length) {
        const suggested = result.goals.map((goal): Candidate => ({ ...goal, key: ++keys, source: "coach", included: true, baseline: "" }));
        setGoals(list => [...suggested, ...list.filter(goal => goal.source !== "coach")]);
        setSuggestedFor(asked);
      } else setMessage(result.message ?? "The Coach had no goals to suggest. Pick or add them yourself, or try again.");
    } catch { setMessage("The Coach could not answer. Pick or add the goals yourself, or try again."); }
    finally { setSuggesting(false); }
  }

  function add() {
    if (!draft.title.trim() || !draft.target.trim()) return;
    const count = goals.length;
    setGoals(list => [...list, { key: ++keys, source: "new", title: draft.title.trim(), color: nextGoalColor(count), icon: "target", tier: chosen.filter(goal => goal.tier === "primary").length < primaryGuideline ? "primary" : "secondary", target: draft.target.trim(), question: "", included: true, baseline: "" }]);
    setDraft({ title: "", target: "" });
    setAdding(false);
  }
  const addOnEnter = (event: KeyboardEvent) => { if (event.key === "Enter") { event.preventDefault(); add(); } if (event.key === "Escape") { event.stopPropagation(); setAdding(false); } };

  function next(event?: { preventDefault(): void }) {
    event?.preventDefault();
    if (step === 1) {
      if (suggest && suggestedFor !== `${lengthDays}:${intention.trim()}`) void askCoach();
      else if (!suggest && !goals.length) setAdding(true);
    }
    if (step < 4) setStep(step + 1);
    else void onStart({
      intention: intention.trim(), startDate: start, lengthDays,
      goals: chosen.map(goal => ({ goalId: goal.goalId, title: goal.title, color: goal.color, icon: goal.icon, tier: goal.tier, target: goal.target.trim(), baseline: goal.baseline.trim() || undefined })),
    }).catch(() => undefined);
  }

  const canContinue = [
    intention.trim().length > 0,
    Boolean(start) && start >= today,
    !suggesting && ready,
    true,
    !write.pending && ready,
  ][step];

  return <div className="mx-auto flex w-full max-w-xl flex-col gap-8 py-6" data-season-setup={STEPS[step]}>
    <div className="flex flex-col gap-2">
      <Progress aria-label={`Step ${step + 1} of ${STEPS.length}`} value={Math.round((step + 1) / STEPS.length * 100)} />
      <ol className="flex justify-between text-xs text-muted-foreground" aria-hidden="true">
        {STEPS.map((name, index) => <li key={name} className={cn(index === step && "font-medium text-foreground", index > step && "opacity-60")}>{name}</li>)}
      </ol>
    </div>

    <form className="flex flex-col gap-8" onSubmit={next} aria-label={`Season setup: ${STEPS[step]}`}>
      {step === 0 && <Step title="What should this season be about?"
        hint={<>A season is one stretch of your year with a short list of goals that get your focus. Say it in your own words{suggest ? "; the Coach turns it into goals." : "; you name the goals next."}</>}>
        <Textarea aria-label="What this season is about" autoFocus rows={4} maxLength={2_000} value={intention} onChange={event => setIntention(event.target.value)} data-field="season-intention"
          placeholder="e.g. Get fit enough for a half marathon in March, and finally finish my essay collection."
          onKeyDown={event => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) next(event); }} />
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map(example => <Button key={example} type="button" variant="outline" size="xs" className="rounded-full font-normal"
            onClick={() => setIntention(current => current.trim() ? `${current.trim()} ${example}.` : `${example}.`)}>{example}</Button>)}
        </div>
      </Step>}

      {step === 1 && <Step title="How long should it run?" hint="Long enough for real progress, short enough to stay in view. You can end a season early.">
        <RadioGroup aria-label="Length" value={String(lengthDays)} onValueChange={value => setLengthDays(Number(value))} className="grid grid-cols-2 gap-3">
          {LENGTHS.map(length => <Label key={length.days} className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-4 font-normal transition-colors hover:bg-muted has-[[data-checked]]:border-primary has-[[data-checked]]:bg-muted" data-season-length={length.days}>
            <RadioGroupItem value={String(length.days)} className="mt-0.5" />
            <span className="flex flex-col gap-0.5"><span className="text-sm font-medium">{length.label}</span><span className="text-xs text-muted-foreground">{length.note}</span></span>
          </Label>)}
        </RadioGroup>
        <FieldSet className="gap-2"><FieldLegend variant="label">Starts</FieldLegend>
          <div className="flex flex-wrap items-center gap-3">
            <ToggleGroup aria-label="Starts" variant="outline" size="sm" value={[startChoice]} onValueChange={value => { if (value[0]) setStartChoice(value[0] as typeof startChoice); }}>
              <ToggleGroupItem value="today" className="px-3 text-xs-plus">Today</ToggleGroupItem>
              <ToggleGroupItem value="monday" className="px-3 text-xs-plus">Next Monday</ToggleGroupItem>
              <ToggleGroupItem value="date" className="px-3 text-xs-plus">Pick a date</ToggleGroupItem>
            </ToggleGroup>
            {startChoice === "date" && <Input type="date" aria-label="Start date" className="w-auto" min={today} value={startDate} onChange={event => setStartDate(event.target.value)} />}
          </div>
        </FieldSet>
        {start && <Hint className="text-sm">Runs {formatDay(start)} – {formatDay(addDays(start, lengthDays - 1))}.</Hint>}
      </Step>}

      {step === 2 && <Step title="Which goals does it focus on?" hint={suggest ? "Switch on the goals for this season. The Coach suggested some from what you wrote; your own goals are there too." : "Switch on the goals for this season, or add new ones."}>
        {suggesting ? <p role="status" className="flex items-center gap-2 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground"><Spinner />The Coach is turning your focus into goals…</p> : <>
          {message && <Hint className="text-sm" aria-live="polite">{message}</Hint>}
          {goals.length > 0 && <List aria-label="Goals" className="flex flex-col rounded-xl border border-border px-4">
            {goals.map(goal => <ListRow key={goal.key} className="items-start gap-3 border-b border-border-subtle py-3 last:border-0" data-setup-goal={goal.source}>
              <Switch className="mt-0.5" checked={goal.included} onCheckedChange={included => patch(goal.key, { included })} aria-label={`Focus on ${goal.title} this season`} data-setup-include="" />
              <div className={cn("flex min-w-0 flex-1 flex-col gap-1", !goal.included && "opacity-60")}>
                <span className="flex items-center gap-2 text-sm font-medium"><GoalIcon color={goal.color} icon={goal.icon} />{goal.title}
                  {goal.source === "coach" && <Sparkles aria-label="Suggested by the Coach" className="size-3.5 text-brand" />}</span>
                {goal.source === "existing" && goal.included
                  ? <Input aria-label={`Target for ${goal.title}`} value={goal.target} maxLength={1_000} placeholder="What does done look like by the season's end?" onChange={event => patch(goal.key, { target: event.target.value })} />
                  : goal.target && <span className="text-xs text-muted-foreground">{goal.target}</span>}
              </div>
              <ToggleGroup aria-label={`Tier of ${goal.title}`} variant="outline" size="sm" disabled={!goal.included} value={[goal.tier]} onValueChange={value => { if (value[0]) patch(goal.key, { tier: value[0] as SeasonTier }); }}>
                <ToggleGroupItem value="primary" className="px-2.5 text-xs-plus">Primary</ToggleGroupItem>
                <ToggleGroupItem value="secondary" className="px-2.5 text-xs-plus">Secondary</ToggleGroupItem>
              </ToggleGroup>
            </ListRow>)}
          </List>}
          {adding ? <div className="flex flex-col gap-2 rounded-xl border border-border p-4" onKeyDown={addOnEnter} data-setup-new-goal="">
            <Input aria-label="New goal" autoFocus value={draft.title} maxLength={200} placeholder="Goal, e.g. Learn to cook ten dishes" onChange={event => setDraft({ ...draft, title: event.target.value })} />
            <Input aria-label="Its target" value={draft.target} maxLength={1_000} placeholder="Done by the season's end looks like…" onChange={event => setDraft({ ...draft, target: event.target.value })} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setAdding(false)}>Cancel</Button>
              <Button type="button" size="sm" disabled={!draft.title.trim() || !draft.target.trim()} onClick={add}>Add</Button>
            </div>
          </div> : <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="ghost" className="-ml-2 font-normal text-muted-foreground hover:text-brand" data-season-action="add-goal" onClick={() => setAdding(true)}><Plus className="text-brand" />Add a goal</Button>
            {suggest && <Button type="button" variant="ghost" className="font-normal text-muted-foreground" onClick={() => void askCoach()}><Sparkles className="text-brand" />Suggest again</Button>}
          </div>}
          {chosen.length > 0 && <Hint className="text-sm">{chosen.filter(goal => goal.tier === "primary").length} primary, {chosen.filter(goal => goal.tier === "secondary").length} secondary.{tooManyPrimary(chosen) && ` More than ${primaryGuideline} primary goals compete for the same best hours.`}</Hint>}
        </>}
      </Step>}

      {step === 3 && <Step title="Where are you starting from?" hint="Your situation today, in your own words: what you already do, what's in the way. The Coach plans from here. Skip any you're unsure of.">
        {chosen.map(goal => <Field key={goal.key} className="flex flex-col gap-2 rounded-xl border border-border p-3" data-setup-start="">
          <FieldLabel htmlFor={`setup-start-${goal.key}`} className="flex items-center gap-2 text-sm font-medium text-foreground"><GoalIcon color={goal.color} icon={goal.icon} />{goal.title}</FieldLabel>
          {/* The Coach's question for this goal prompts the answer; the label names the goal. */}
          <Textarea id={`setup-start-${goal.key}`} rows={2} maxLength={2_000} value={goal.baseline} onChange={event => patch(goal.key, { baseline: event.target.value })}
            aria-description={goal.question || undefined} placeholder={goal.question || "Where does it stand today?"} />
        </Field>)}
      </Step>}

      {step === 4 && <Step title="Your season" hint="Check it over. Everything stays editable on the Season page.">
        <div className="flex flex-col gap-4 rounded-xl border border-border p-4" data-setup-review="">
          <p className="border-l-2 border-brand pl-3 text-sm">{intention.trim()}</p>
          <p className="text-sm text-muted-foreground">{LENGTHS.find(length => length.days === lengthDays)?.label} · {formatDay(start)} – {formatDay(addDays(start, lengthDays - 1))}</p>
          <List aria-label="Season goals" className="flex flex-col">
            {chosen.map(goal => <ListRow key={goal.key} className="items-start gap-3 border-t border-border-subtle py-3">
              <GoalIcon color={goal.color} icon={goal.icon} className="mt-0.5" />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center gap-2 text-sm font-medium">{goal.title}<Badge variant="secondary">{goal.tier === "primary" ? "Primary" : "Secondary"}</Badge></span>
                <span className="text-sm">{goal.target}</span>
                {goal.baseline.trim() && <span className="line-clamp-2 text-xs text-muted-foreground">Starting from: {goal.baseline.trim()}</span>}
              </div>
            </ListRow>)}
          </List>
        </div>
        {write.error && <FormError>{write.error}</FormError>}
      </Step>}

      <div className="flex items-center justify-between gap-2">
        {step > 0 ? <Button type="button" variant="ghost" onClick={() => setStep(step - 1)} data-season-action="setup-back"><ArrowLeft />Back</Button> : <span />}
        <Button type="submit" disabled={!canContinue} data-season-action={step === 4 ? "start" : "setup-next"}>
          {step === 4 ? write.pending ? <><Spinner />Starting…</> : "Start season" : <>Continue<ArrowRight /></>}
        </Button>
      </div>
    </form>
  </div>;
}

function Step({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return <section className="flex flex-col gap-5">
    <div className="flex flex-col gap-2">
      <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
      {hint && <Hint className="text-sm">{hint}</Hint>}
    </div>
    {children}
  </section>;
}
