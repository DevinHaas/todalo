import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState, type FormEvent } from "react";
import { AlarmClock, ArrowUp, AudioLines, Calendar1, CalendarIcon, Check, Flag, Goal, Hash, Inbox, Paperclip, Plus, X } from "lucide-react";
import { Link, useInRouterContext } from "react-router";
import type { QuickAddMatch } from "@todalo/ramble/quick-add";
import {
  canonicalDateText, canonicalRecurrenceText, canonicalTimeText, highlightSegments, initialSyncState, quickAddTimeMatchText,
  spliceMatch, syncQuickAddFields, type QuickAddSyncState,
} from "@todalo/ramble/quick-add-sync";
import type { Recurrence } from "@todalo/ramble/recurrence";
import { dateInputValue, localInstant, operationId, timeInputValue, type NewTask, type Placement, type TaskDetails, type TaskDto } from "./tasks";
import {
  composerFields, dateValue, dueDateLabel, fromDateValue, fromRecurrenceDto, parseTitle, quickAddTask, quickDates, repeatPresetsFor, scheduleOf,
} from "./quick-add";
import { Calendar, Dropdown, Popover, type Option } from "./popover";
import { releaseFocus } from "./software-keyboard";
import { inlineError } from "./toasts";
import { cn } from "./ui";

const PARSE_DEBOUNCE_MS = 150;

/**
 * The account's smart date recognition setting for every composer (legacy
 * SmartDateRecognitionProvider), provided by SmartDatesProvider. Off unless
 * known to be on, so a draft typed while settings load never gains a date the
 * user opted out of.
 */
export const SmartDates = createContext(false);

/**
 * The account's projects and labels for every composer's project picker and
 * Additional actions (ComposerChoicesProvider). Until they load the picker
 * offers Inbox and the composer's own project, and labels show as loading.
 */
export interface Choice { id: string; name: string }
export const ComposerChoices = createContext<{ projects?: Choice[]; labels?: Choice[] }>({});

function seedState(dueDate: string | null, dueDateEnd: string | null): QuickAddSyncState {
  const start = dueDate ? new Date(dueDate) : undefined;
  const date = start && new Date(start.getFullYear(), start.getMonth(), start.getDate());
  return syncQuickAddFields(initialSyncState, { type: "seed", date, time: timeInputValue(dueDate), endTime: dueDate ? timeInputValue(dueDateEnd, false) : "" });
}

/**
 * The legacy TaskComposer with smart quick add (tickets 5, 12). Recognized
 * date/time/repeat phrases are highlighted in a backdrop under a transparent
 * input (ADR 0002) and fill the date pill; tapping a highlight rejects it for
 * this draft, and a manual pick in the date pill wins over the phrase (and
 * rewrites it) until the phrase changes — the shared @todalo/ramble rules.
 * Input is kept until the server confirms. The operation ID is reused while
 * the task to create is unchanged, so resubmitting after an unclear failure
 * cannot create a second copy of a task that was in fact saved.
 */
export function Composer({ dueDate, dueDateEnd, destination, onCreate, onCancel, startOpen = false, quick = false, smartDates: override, projectId = null, sectionId = null, placement, parentId, editing, onUpdate }: {
  /** Initial due date (with time for a schedule slot); null starts undated (Inbox). */
  dueDate: () => string | null;
  /** End of a schedule slot (ticket 16). */
  dueDateEnd?: () => string | null;
  /** Date pill text while the seeded date is kept (Upcoming days, schedule slots). */
  destination?: string;
  /** `direction`: where the next draft goes (below the task just added, or above it). */
  onCreate?: (task: NewTask, direction: "above" | "below") => Promise<unknown>;
  onCancel?: () => void;
  startOpen?: boolean;
  /** The quick add dialog's layout: title, chips, then a Ramble/submit button (no footer text buttons). */
  quick?: boolean;
  /** Overrides the SmartDates context (tests). */
  smartDates?: boolean;
  /** The project view section it was opened in (legacy TaskComposer projectId/sectionId); null is the Inbox. */
  projectId?: string | null; sectionId?: string | null;
  /**
   * Where the task goes in its project's manual order. Top/bottom composers
   * show a position toggle; after each add the next draft goes below the task
   * just added (or above it, with Save task and add above), as legacy did.
   */
  placement?: Placement;
  /** Adds a sub-task: it joins the parent's project and section (pass them), so no project picker. */
  parentId?: string;
  /**
   * Edits this task instead of adding one (⌘E on a row): the draft starts from it
   * (pass its dueDate, project and section too), and ✓ hands the changes and the
   * picked project to onUpdate, then closes.
   */
  editing?: TaskDto;
  onUpdate?: (details: TaskDetails, projectId: string | null) => Promise<unknown>;
}) {
  const account = useContext(SmartDates);
  const choices = useContext(ComposerChoices);
  const routed = useInRouterContext();
  const smartDates = override ?? account;
  const seed = () => {
    const state = seedState(dueDate(), editing ? editing.dueDateEnd : dueDateEnd?.() ?? null);
    return editing?.recurrence ? syncQuickAddFields(state, { type: "manualRecurrence", recurrence: fromRecurrenceDto(editing.recurrence), matchText: null }) : state;
  };
  const [open, setOpen] = useState(startOpen);
  const [title, setTitle] = useState(editing?.title ?? "");
  const [parsedTitle, setParsedTitle] = useState("");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [describing, setDescribing] = useState(Boolean(editing?.description));
  // Editing: date words already in the title keep their meaning as text; only new ones set the date.
  const [rejected, setRejected] = useState<ReadonlySet<string>>(() => new Set(editing ? parseTitle(editing.title, smartDates, new Set()).matches.map(match => match.text.toLowerCase()) : []));
  const [sync, dispatch] = useReducer(syncQuickAddFields, undefined, seed);
  const [seeded] = useState(() => scheduleOf(sync).date);
  // The slot's (or edited task's) time: "for 1h" alone lengthens it.
  const [base] = useState(() => sync.time.value ? { start: sync.time.value, end: sync.endTime.value || null } : undefined);
    const [customRepeat, setCustomRepeat] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [project, setProject] = useState(projectId);
  const [position, setPosition] = useState(placement);
  const [metadata, setMetadata] = useState(() => editing
    ? { priority: editing.priority, deadline: editing.deadline ? dateInputValue(editing.deadline) : "", labelIds: [...editing.labelIds] }
    : { priority: 4, deadline: "", labelIds: [] as string[] });
  const operation = useRef<{ key: string; id: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);

  useEffect(() => { const timer = setTimeout(() => setParsedTitle(title), PARSE_DEBOUNCE_MS); return () => clearTimeout(timer); }, [title]);
  // Debounced, so field sync does not refire on every keystroke…
  const parsed = useMemo(() => parseTitle(parsedTitle, smartDates, rejected, undefined, base), [parsedTitle, smartDates, rejected, base]);
  useEffect(() => dispatch({ type: "parse", parsed }), [parsed]);
  // …while the highlight offsets always follow the title as typed.
  const live = useMemo(() => parseTitle(title, smartDates, rejected, undefined, base), [title, smartDates, rejected, base]);
  const segments = highlightSegments(title, live.matches);
  const schedule = scheduleOf(sync);

  const reset = () => {
    setTitle(""); setParsedTitle(""); setDescription(""); setDescribing(false); setRejected(new Set()); dispatch({ type: "seed", date: seeded, time: "" });
    setMetadata({ priority: 4, deadline: "", labelIds: [] }); operation.current = null;
  };
  const close = () => { setOpen(false); reset(); setError(null); setPosition(placement); onCancel?.(); requestAnimationFrame(() => trigger.current?.focus()); };
  if (!open) return <button ref={trigger} type="button" className="composer" onClick={() => setOpen(true)}><Plus />Add task</button>;

  function reject(match: QuickAddMatch) {
    setRejected(previous => new Set(previous).add(match.text.toLowerCase()));
    dispatch({ type: "reject", kind: match.kind });
    // Rejecting the date also drops its time, as clearing the date does.
    if (match.kind === "date") dispatch({ type: "reject", kind: "time" });
  }
  // A manual pick rewrites the phrase it overrides to a canonical form, so the
  // title and the pill never visibly disagree; returns the anchoring text.
  function manualPhrase(kind: QuickAddMatch["kind"], canonical: string | null) {
    const match = live.matches.find(item => item.kind === kind);
    if (canonical && match) { setTitle(current => spliceMatch(current, match, canonical)); return canonical; }
    return match?.text ?? null;
  }
  function changeDate(date: Date | undefined) {
    dispatch({ type: "manualDate", date, matchText: manualPhrase("date", date ? canonicalDateText(date) : null) });
    if (!date) { changeStart(""); changeEnd(""); }
  }
  function changeStart(time: string) { dispatch({ type: "manualTime", time, matchText: manualPhrase("time", time ? canonicalTimeText(time) : null) }); }
  // The end time rides the start's phrase and never rewrites the title.
  function changeEnd(time: string) { dispatch({ type: "manualEndTime", time, matchText: quickAddTimeMatchText(live.matches) }); }
  function changeRepeat(recurrence: Recurrence | undefined) {
    dispatch({ type: "manualRecurrence", recurrence, matchText: manualPhrase("recurrence", recurrence ? canonicalRecurrenceText(recurrence) : null) });
  }
  const syncScroll = () => { if (backdrop.current && input.current) backdrop.current.scrollLeft = input.current.scrollLeft; };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Save task and add above (keyboard) submits through the same Add task button.
    const direction = event.currentTarget.dataset.direction === "above" ? "above" : "below";
    delete event.currentTarget.dataset.direction;
    if (!title.trim() || pending) return;
    const fields = quickAddTask(title, sync, parseTitle(title, smartDates, rejected, undefined, base));
    if (editing) {
      setPending(true); setError(null);
      try {
        await onUpdate?.({
          updatedAt: editing.updatedAt ?? "", title: fields.title, description: description.trim(), priority: metadata.priority,
          deadline: metadata.deadline ? localInstant(metadata.deadline) : null, dueDate: fields.dueDate, dueDateEnd: fields.dueDateEnd, recurrence: fields.recurrence,
          ...(choices.labels && { labelIds: metadata.labelIds.filter(id => choices.labels!.some(label => label.id === id)) }),
        }, project);
        close();
      } catch (reason) {
        setError(inlineError(reason));
      } finally { setPending(false); }
      return;
    }
    const task = {
      title: fields.title, ...(description.trim() && { description: description.trim() }), dueDate: fields.dueDate,
      ...(fields.dueDateEnd && { dueDateEnd: fields.dueDateEnd }), ...(fields.recurrence && { recurrence: fields.recurrence }),
      ...composerFields(metadata, project, { projectId, sectionId, placement: position }), ...(parentId && { parentId }),
    };
    const key = JSON.stringify(task);
    if (operation.current?.key !== key) operation.current = { key, id: operationId() };
    setPending(true); setError(null);
    try {
      const created = operation.current.id;
      await onCreate?.({ id: created, ...task }, direction);
      if (task.placement) setPosition({ edge: direction, anchorId: created });
      reset();
      input.current?.focus();
    } catch (reason) {
      setError(inlineError(reason));
    } finally { setPending(false); }
  }

  const today = schedule.date?.toDateString() === new Date().toDateString();
  const sameAsSeed = schedule.date && seeded && schedule.date.getTime() === seeded.getTime();
  const time = schedule.start && schedule.end ? `${schedule.start}-${schedule.end}` : schedule.start;
  const label = (sameAsSeed && destination) || dueDateLabel(schedule.date);
  const deadline = fromDateValue(metadata.deadline);
  const projects: Option<string>[] = [{ value: "", label: "Inbox", icon: <Inbox /> },
    ...projectOptions(choices.projects, projectId).map(choice => ({ value: choice.id, label: choice.name, icon: <Hash /> }))];
  const priorityName = metadata.priority === 4 && quick ? "Priority" : `Priority ${metadata.priority}`;
  const chips = <div className="composer-pills">
    {/* The + menu holds what the chips do not: the description and labels. */}
    <Popover label="More options" triggerClassName="chip chip-square" trigger={<Plus />} data={{ "data-composer-more": "" }}>
      {close => <>
        {!describing && <button type="button" className="popover-item add-description" onClick={() => { setDescribing(true); close(false); }}>Add description</button>}
        <p className="panel-heading">Labels</p>
        {!choices.labels ? <p className="state" role="status">Loading labels…</p> : choices.labels.length > 0 ? choices.labels.map(choice => <label key={choice.id} className="popover-item label-option">
          <input type="checkbox" checked={metadata.labelIds.includes(choice.id)} onChange={(event) => setMetadata(current => ({ ...current, labelIds: event.target.checked ? [...current.labelIds, choice.id] : current.labelIds.filter(id => id !== choice.id) }))} />{choice.name}
        </label>) : <p className="state">Create labels in Labels.</p>}
      </>}
    </Popover>
    <Popover className={schedule.date ? "chip-group set" : "chip-group"} label={`Date: ${label}${time ? ` ${time}` : ""}`} data={{ "data-tone": today ? "today" : "date" }}
      trigger={<>{today ? <Calendar1 /> : <CalendarIcon />}{label}{time && ` ${time}`}</>}
      after={schedule.date && <button type="button" className="icon-button small" aria-label="Clear date" onClick={() => changeDate(undefined)}><X /></button>}>
      {close => <SchedulePanel schedule={schedule} onDate={(date) => { changeDate(date); close(); }} onStart={changeStart} onEnd={changeEnd}
        onRepeat={(recurrence) => { changeRepeat(recurrence); close(); }} onCustom={() => { setCustomRepeat(true); close(false); }} />}
    </Popover>
    <Popover className={deadline ? "chip-group set" : "chip-group"} label={`Deadline: ${deadline ? dueDateLabel(deadline) : "none"}`} data={{ "data-metadata-field": "deadline" }}
      trigger={<><Goal />{deadline ? dueDateLabel(deadline) : "Deadline"}</>}
      after={deadline && <button type="button" className="icon-button small" aria-label="Clear deadline" onClick={() => setMetadata(current => ({ ...current, deadline: "" }))}><X /></button>}>
      {close => <DatePanel value={deadline} none="No deadline" onPick={(date) => { setMetadata(current => ({ ...current, deadline: dateValue(date) })); close(); }} />}
    </Popover>
    <Dropdown label="Priority" value={metadata.priority} options={priorityOptions} className={metadata.priority !== 4 ? "chip set" : "chip"} data={{ "data-metadata-field": "priority" }}
      onChange={(priority) => setMetadata(current => ({ ...current, priority }))} triggerContent={<><Flag data-priority={metadata.priority} />{priorityName}</>} />
    {/* ponytail: legacy stub pills, no feature behind them yet. */}
    <button type="button" className="chip" disabled><AlarmClock />Reminders</button>
    {!quick && <button type="button" className="chip" disabled><Paperclip />Attachment</button>}
    {(position?.edge === "top" || position?.edge === "bottom") && <button type="button" className="chip" aria-label={`Position: ${position.edge}`}
      onClick={() => setPosition({ edge: position.edge === "top" ? "bottom" : "top" })}>{position.edge === "top" ? "Add at top" : "Add at bottom"}</button>}
  </div>;
  // A sub-task's project is its parent's: shown, not picked.
  const projectPicker = parentId ? <span className="chip">{projectId ? <Hash /> : <Inbox />}{projectId ? choices.projects?.find(item => item.id === projectId)?.name ?? "Project" : "Inbox"}</span>
    : <Dropdown label="Project" value={project ?? ""} options={projects} onChange={(value) => setProject(value || null)} className={quick ? "chip" : "chip project-picker"} chevron={!quick} />;
  // Legacy composer waveform: Ramble with this draft's date as the default (ticket 21).
  const ramble = (className: string) => routed && <Link to={schedule.date ? `/ramble?date=${dateValue(schedule.date)}` : "/ramble"} className={className} aria-label="Open Ramble" onClick={close}><AudioLines /></Link>;
  return <>
    <form ref={releaseFocus} className={quick ? "composer-form quick" : "composer-form"} onSubmit={(event) => { event.stopPropagation(); void submit(event); }}
      onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); close(); } }}>
      {error && <p role="alert" className="form-error">{error}</p>}
      <div className="quick-add-title">
        <div ref={backdrop} className="quick-add-backdrop" aria-hidden="true">
          {segments.map((segment, index) => {
            // Phrases only a space apart share one highlight ("today 4pm for 1h"); its ends get the
            // padding, offset by an equal negative margin so the highlight stays on the input's text.
            const lit = (at: number) => Boolean(segments[at]?.match) || (/^\s+$/.test(segments[at]?.text ?? "x") && Boolean(segments[at - 1]?.match && segments[at + 1]?.match));
            if (!lit(index)) return <span key={index}>{segment.text}</span>;
            const ends = cn("py-1", !lit(index - 1) && "-ml-1 rounded-l-md pl-1", !lit(index + 1) && "-mr-1 rounded-r-md pr-1");
            return segment.match
              ? <span key={index} role="button" tabIndex={-1} className={cn("quick-add-match", ends)} data-kind={segment.match.kind} onClick={() => reject(segment.match!)}>{segment.text}</span>
              : <span key={index} className={cn("quick-add-match pointer-events-none", ends)}>{segment.text}</span>;
          })}
        </div>
        <input ref={input} autoFocus aria-label="Task name" placeholder="Task name" enterKeyHint="done" autoComplete="off" value={title}
          onChange={(event) => setTitle(event.target.value)} onScroll={syncScroll} onSelect={syncScroll} />
      </div>
      {describing ? <input autoFocus aria-label="Description" placeholder="Description" value={description} onChange={(event) => setDescription(event.target.value)} />
        : !quick && <button type="button" className="text-action add-description" onClick={() => setDescribing(true)}>Add description</button>}
      {chips}
      {quick ? <div className="composer-footer">
        {projectPicker}
        <div className="composer-actions">
          <button type="button" className="icon-button quick-close" aria-label="Close" onClick={close}><X /></button>
          {editing ? <button type="submit" className="quick-primary" aria-label="Save task" disabled={pending || !title.trim()}><Check /></button>
            : title.trim() ? <button type="submit" className="quick-primary" aria-label="Add task" disabled={pending}><ArrowUp /></button>
            : ramble("quick-primary") || <button type="submit" className="quick-primary" aria-label="Add task" disabled><AudioLines /></button>}
        </div>
      </div> : <div className="composer-footer">
        {projectPicker}
        <div className="composer-actions">
          {ramble("icon-button")}
          <button type="button" className="button outline" onClick={close}>Cancel</button>
          <button type="submit" className="button" disabled={!title.trim() || pending}>{pending ? "Adding…" : "Add task"}</button>
        </div>
      </div>}
    </form>
    {customRepeat && <CustomRepeatDialog recurrence={schedule.recurrence} onClose={() => setCustomRepeat(false)} onConfirm={(recurrence) => { changeRepeat(recurrence); setCustomRepeat(false); }} />}
  </>;
}

// The composer's own project stays selectable while the list loads (or if it failed).
const projectOptions = (projects: Choice[] | undefined, own: string | null): Choice[] =>
  projects ?? (own ? [{ id: own, name: "This project" }] : []);

/** Priority choices with the legacy flag colors (red, orange, blue, none). */
export const priorityOptions: Option<number>[] = [1, 2, 3, 4].map(priority => ({
  value: priority, label: `Priority ${priority}${priority === 1 ? " — highest" : priority === 4 ? " — normal" : ""}`, icon: <Flag data-priority={priority} />,
}));

/** Quick dates, "none", and a month grid: the Date and Deadline popovers' shared top half. */
function DatePanel({ value, none, onPick }: { value?: Date; none: string; onPick(date: Date | undefined): void }) {
  return <>
    <div className="panel-list">
      {quickDates().map(({ label, day, date }) => <button key={label} type="button" onClick={() => onPick(date)}>{label}<span>{day}</span></button>)}
      <button type="button" onClick={() => onPick(undefined)}>{none}</button>
    </div>
    <Calendar selected={value} onSelect={onPick} />
  </>;
}

/** The legacy date pill popover: quick dates, calendar, time range and Repeat. */
function SchedulePanel({ schedule, onDate, onStart, onEnd, onRepeat, onCustom }: {
  schedule: ReturnType<typeof scheduleOf>;
  onDate(date: Date | undefined): void; onStart(time: string): void; onEnd(time: string): void;
  onRepeat(recurrence: Recurrence | undefined): void; onCustom(): void;
}) {
  const [everyDays, setEveryDays] = useState("1");
  const anchor = schedule.date ?? new Date();
  const setEvery = () => { const n = parseInt(everyDays, 10); if (n > 0) onRepeat({ n, unit: "day", basedOn: "scheduled" }); };
  const current = schedule.recurrence;
  return <div className="schedule-panel" role="group" aria-label="Date and repeat">
    <DatePanel value={schedule.date} none="No Date" onPick={onDate} />
    {schedule.date && <div className="time-range">
      <input type="time" aria-label="Start time" value={schedule.start} onChange={(event) => onStart(event.target.value)} />
      <span>to</span>
      <input type="time" aria-label="End time" value={schedule.end} disabled={!schedule.start} onChange={(event) => onEnd(event.target.value)} />
    </div>}
    <div className="panel-list">
      <p className="panel-heading">Repeat</p>
      <button type="button" aria-pressed={!current} onClick={() => onRepeat(undefined)}>Don&apos;t repeat</button>
      {repeatPresetsFor(anchor).map(({ label, recurrence }) => <button key={label} type="button" aria-pressed={current?.n === recurrence.n && current?.unit === recurrence.unit} onClick={() => onRepeat(recurrence)}>{label}</button>)}
      <div className="every-n">
        <span>Every</span>
        <input type="number" min={1} inputMode="numeric" aria-label="Repeat every N days" value={everyDays} onChange={(event) => setEveryDays(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); setEvery(); } }} />
        <span>days</span>
        <button type="button" className="button outline small" onClick={setEvery}>Set</button>
      </div>
      <button type="button" onClick={onCustom}>Custom…</button>
    </div>
  </div>;
}

const UNITS: Recurrence["unit"][] = ["day", "week", "month", "year"];

/** The legacy Custom repeat dialog: basis, every N units, and an optional end date. */
export function CustomRepeatDialog({ recurrence, onClose, onConfirm }: { recurrence: Recurrence | undefined; onClose(): void; onConfirm(recurrence: Recurrence): void }) {
  const [basedOn, setBasedOn] = useState<Recurrence["basedOn"]>(recurrence?.basedOn ?? "scheduled");
  const [n, setN] = useState(String(recurrence?.n ?? 1));
  const [unit, setUnit] = useState<Recurrence["unit"]>(recurrence?.unit ?? "day");
  const [ends, setEnds] = useState<"never" | "on">(recurrence?.until ? "on" : "never");
  const [until, setUntil] = useState(dateValue(recurrence?.until ?? undefined));
  const count = parseInt(n, 10);
  const valid = count > 0 && count <= 1000 && (ends === "never" || Boolean(until));
  const confirm = () => { if (valid) onConfirm({ n: count, unit, basedOn, until: ends === "on" ? fromDateValue(until) : null }); };
  return <div className="dialog-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-labelledby="custom-repeat-title" className="dialog custom-repeat"
      onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
      <h2 id="custom-repeat-title" className="dialog-title">Custom repeat</h2>
      <form ref={releaseFocus} onSubmit={(event) => { event.preventDefault(); confirm(); }}>
        <p className="panel-heading">Based on</p>
        <div className="segmented">
          <button type="button" className={basedOn === "scheduled" ? "button small" : "button outline small"} aria-pressed={basedOn === "scheduled"} onClick={() => setBasedOn("scheduled")}>Scheduled date</button>
          <button type="button" className={basedOn === "completed" ? "button small" : "button outline small"} aria-pressed={basedOn === "completed"} onClick={() => setBasedOn("completed")}>Completed date</button>
        </div>
        <div className="every-n">
          <span>Every</span>
          <input autoFocus type="number" min={1} max={1000} inputMode="numeric" aria-label="Repeat every" value={n} onChange={(event) => setN(event.target.value)} />
          <Dropdown<Recurrence["unit"]> label="Repeat unit" value={unit} onChange={setUnit} options={UNITS.map(value => ({ value, label: (count || 1) === 1 ? value : `${value}s` }))} />
        </div>
        <p className="panel-heading">Ends</p>
        <div className="segmented">
          <button type="button" className={ends === "never" ? "button small" : "button outline small"} aria-pressed={ends === "never"} onClick={() => setEnds("never")}>Never</button>
          <button type="button" className={ends === "on" ? "button small" : "button outline small"} aria-pressed={ends === "on"} onClick={() => setEnds("on")}>On date</button>
        </div>
        {ends === "on" && <label>End date<input type="date" value={until} onChange={(event) => setUntil(event.target.value)} /></label>}
        <div className="composer-actions">
          <button type="button" className="button outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="button" disabled={!valid}>Set</button>
        </div>
      </form>
    </div>
  </div>;
}
