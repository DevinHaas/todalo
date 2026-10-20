import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState, type FormEvent } from "react";
import { AlarmClock, AudioLines, CalendarIcon, Flag, Inbox, MoreHorizontal, Paperclip, Plus, Sun, X } from "lucide-react";
import { Link, useInRouterContext } from "react-router";
import type { QuickAddMatch } from "@todalo/ramble/quick-add";
import {
  canonicalDateText, canonicalRecurrenceText, canonicalTimeText, highlightSegments, initialSyncState, quickAddTimeMatchText,
  spliceMatch, syncQuickAddFields, type QuickAddSyncState,
} from "@todalo/ramble/quick-add-sync";
import type { Recurrence } from "@todalo/ramble/recurrence";
import { operationId, timeInputValue, type NewTask, type Placement } from "./tasks";
import {
  composerFields, dateValue, dueDateLabel, fromDateValue, parseTitle, quickAddTask, quickDateOptions, repeatPresetsFor, scheduleOf,
} from "./quick-add";
import { releaseFocus } from "./software-keyboard";

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
export function Composer({ dueDate, dueDateEnd, destination, onCreate, onCancel, startOpen = false, smartDates: override, projectId = null, sectionId = null, placement }: {
  /** Initial due date (with time for a schedule slot); null starts undated (Inbox). */
  dueDate: () => string | null;
  /** End of a schedule slot (ticket 16). */
  dueDateEnd?: () => string | null;
  /** Date pill text while the seeded date is kept (Upcoming days, schedule slots). */
  destination?: string;
  /** `direction`: where the next draft goes (below the task just added, or above it). */
  onCreate: (task: NewTask, direction: "above" | "below") => Promise<unknown>;
  onCancel?: () => void;
  startOpen?: boolean;
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
}) {
  const account = useContext(SmartDates);
  const choices = useContext(ComposerChoices);
  const routed = useInRouterContext();
  const smartDates = override ?? account;
  const seed = () => seedState(dueDate(), dueDateEnd?.() ?? null);
  const [open, setOpen] = useState(startOpen);
  const [title, setTitle] = useState("");
  const [parsedTitle, setParsedTitle] = useState("");
  const [description, setDescription] = useState("");
  const [describing, setDescribing] = useState(false);
  const [rejected, setRejected] = useState<ReadonlySet<string>>(new Set());
  const [sync, dispatch] = useReducer(syncQuickAddFields, undefined, seed);
  const [seeded] = useState(() => scheduleOf(sync).date);
  const [scheduling, setScheduling] = useState(false);
  const [customRepeat, setCustomRepeat] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [project, setProject] = useState(projectId);
  const [position, setPosition] = useState(placement);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [metadata, setMetadata] = useState({ priority: 4, deadline: "", labelIds: [] as string[] });
  const operation = useRef<{ key: string; id: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);

  useEffect(() => { const timer = setTimeout(() => setParsedTitle(title), PARSE_DEBOUNCE_MS); return () => clearTimeout(timer); }, [title]);
  // Debounced, so field sync does not refire on every keystroke…
  const parsed = useMemo(() => parseTitle(parsedTitle, smartDates, rejected), [parsedTitle, smartDates, rejected]);
  useEffect(() => dispatch({ type: "parse", parsed }), [parsed]);
  // …while the highlight offsets always follow the title as typed.
  const live = useMemo(() => parseTitle(title, smartDates, rejected), [title, smartDates, rejected]);
  const segments = highlightSegments(title, live.matches);
  const schedule = scheduleOf(sync);

  const reset = () => {
    setTitle(""); setParsedTitle(""); setDescription(""); setDescribing(false); setRejected(new Set()); dispatch({ type: "seed", date: seeded, time: "" });
    setMetadata({ priority: 4, deadline: "", labelIds: [] }); operation.current = null;
  };
  const close = () => { setOpen(false); reset(); setError(null); setScheduling(false); setActionsOpen(false); setPosition(placement); onCancel?.(); };
  if (!open) return <button type="button" className="composer" onClick={() => setOpen(true)}><Plus />Add task</button>;

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
    const fields = quickAddTask(title, sync, parseTitle(title, smartDates, rejected));
    const task = {
      title: fields.title, ...(description.trim() && { description: description.trim() }), dueDate: fields.dueDate,
      ...(fields.dueDateEnd && { dueDateEnd: fields.dueDateEnd }), ...(fields.recurrence && { recurrence: fields.recurrence }),
      ...composerFields(metadata, project, { projectId, sectionId, placement: position }),
    };
    const key = JSON.stringify(task);
    if (operation.current?.key !== key) operation.current = { key, id: operationId() };
    setPending(true); setError(null);
    try {
      const created = operation.current.id;
      await onCreate({ id: created, ...task }, direction);
      if (task.placement) setPosition({ edge: direction, anchorId: created });
      reset(); setScheduling(false);
      input.current?.focus();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Your changes could not be saved. Try again.");
    } finally { setPending(false); }
  }

  const today = schedule.date?.toDateString() === new Date().toDateString();
  const sameAsSeed = schedule.date && seeded && schedule.date.getTime() === seeded.getTime();
  const time = schedule.start && schedule.end ? `${schedule.start}-${schedule.end}` : schedule.start;
  const label = (sameAsSeed && destination) || dueDateLabel(schedule.date);
  return <>
    <form ref={releaseFocus} className="composer-form" onSubmit={submit} onKeyDown={(event) => { if (event.key === "Escape") close(); }}>
      {error && <p role="alert" className="form-error">{error}</p>}
      <div className="quick-add-title">
        <div ref={backdrop} className="quick-add-backdrop" aria-hidden="true">
          {segments.map((segment, index) => segment.match
            ? <span key={index} role="button" tabIndex={-1} className="quick-add-match" data-kind={segment.match.kind} onClick={() => reject(segment.match!)}>{segment.text}</span>
            : <span key={index}>{segment.text}</span>)}
        </div>
        <input ref={input} autoFocus aria-label="Task name" placeholder="Task name" enterKeyHint="done" autoComplete="off" value={title}
          onChange={(event) => setTitle(event.target.value)} onScroll={syncScroll} onSelect={syncScroll} />
      </div>
      {/* Legacy hides the description until asked for. */}
      {describing ? <input autoFocus aria-label="Description" placeholder="Description" value={description} onChange={(event) => setDescription(event.target.value)} />
        : <button type="button" className="text-action add-description" onClick={() => setDescribing(true)}>Add description</button>}
      <div className="composer-pills">
        <button type="button" className={schedule.date ? "button outline small set" : "button outline small"} aria-expanded={scheduling} aria-label={`Date: ${label}${time ? ` ${time}` : ""}`} onClick={() => setScheduling(value => !value)}>
          {today ? <Sun /> : <CalendarIcon />}{label}{time && ` ${time}`}
        </button>
        {schedule.date && <button type="button" className="icon-button small" aria-label="Clear date" onClick={() => changeDate(undefined)}><X /></button>}
        <button type="button" className={metadata.priority !== 4 ? "button outline small set" : "button outline small"} onClick={() => setActionsOpen(true)}><Flag />Priority {metadata.priority}</button>
        {/* ponytail: legacy stub pills, no feature behind them yet. */}
        <button type="button" className="button outline small" disabled><AlarmClock />Reminders</button>
        <button type="button" className="button outline small" disabled><Paperclip />Attachment</button>
        <button type="button" className="icon-button small" aria-label="Additional actions" aria-expanded={actionsOpen} onClick={() => setActionsOpen(value => !value)}><MoreHorizontal /></button>
        {(position?.edge === "top" || position?.edge === "bottom") && <button type="button" className="button outline small" aria-label={`Position: ${position.edge}`}
          onClick={() => setPosition({ edge: position.edge === "top" ? "bottom" : "top" })}>{position.edge === "top" ? "Add at top" : "Add at bottom"}</button>}
      </div>
      {actionsOpen && <MetadataFields value={metadata} labels={choices.labels} onChange={(change) => setMetadata(current => ({ ...current, ...change }))} />}
      {scheduling && <SchedulePanel schedule={schedule} onDate={(date) => { changeDate(date); }} onStart={changeStart} onEnd={changeEnd}
        onRepeat={(recurrence) => { changeRepeat(recurrence); setScheduling(false); }} onCustom={() => { setCustomRepeat(true); setScheduling(false); }} onDone={() => setScheduling(false)} />}
      <div className="composer-footer">
        <label className="pill project"><Inbox /><select aria-label="Project" value={project ?? ""} onChange={(event) => setProject(event.target.value || null)}>
          <option value="">Inbox</option>
          {projectOptions(choices.projects, projectId).map(choice => <option key={choice.id} value={choice.id}>{choice.name}</option>)}
        </select></label>
        <div className="composer-actions">
          {/* Legacy composer waveform: Ramble with this draft's date as the default (ticket 21). */}
          {routed && <Link to={schedule.date ? `/ramble?date=${dateValue(schedule.date)}` : "/ramble"} className="icon-button" aria-label="Open Ramble" onClick={close}><AudioLines /></Link>}
          <button type="button" className="button outline" onClick={close}>Cancel</button>
          <button type="submit" className="button" disabled={!title.trim() || pending}>{pending ? "Adding…" : "Add task"}</button>
        </div>
      </div>
    </form>
    {customRepeat && <CustomRepeatDialog recurrence={schedule.recurrence} onClose={() => setCustomRepeat(false)} onConfirm={(recurrence) => { changeRepeat(recurrence); setCustomRepeat(false); }} />}
  </>;
}

// The composer's own project stays selectable while the list loads (or if it failed).
const projectOptions = (projects: Choice[] | undefined, own: string | null): Choice[] =>
  projects ?? (own ? [{ id: own, name: "This project" }] : []);

/** The legacy composer's Additional actions (TaskMetadataFields): priority, deadline and labels. */
function MetadataFields({ value, labels, onChange }: { value: { priority: number; deadline: string; labelIds: string[] }; labels?: Choice[]; onChange(change: Partial<typeof value>): void }) {
  return <div className="schedule-panel" role="group" aria-label="Additional actions">
    <label>Priority<select data-metadata-field="priority" autoFocus value={value.priority} onChange={(event) => onChange({ priority: Number(event.target.value) })}>
      {[1, 2, 3, 4].map(priority => <option key={priority} value={priority}>Priority {priority}{priority === 1 ? " — highest" : priority === 4 ? " — normal" : ""}</option>)}
    </select></label>
    <div className="field-row">
      <label>Deadline<input data-metadata-field="deadline" type="date" value={value.deadline} onChange={(event) => onChange({ deadline: event.target.value })} /></label>
      <button type="button" className="text-action" disabled={!value.deadline} onClick={() => onChange({ deadline: "" })}>Clear deadline</button>
    </div>
    <fieldset className="label-choices"><legend>Labels</legend>
      {!labels ? <p className="state" role="status">Loading labels…</p> : labels.length > 0 ? <div className="label-options">{labels.map(label => <label key={label.id} className="label-option">
        <input type="checkbox" checked={value.labelIds.includes(label.id)} onChange={(event) => onChange({ labelIds: event.target.checked ? [...value.labelIds, label.id] : value.labelIds.filter(id => id !== label.id) })} />{label.name}
      </label>)}</div> : <p className="state">Create labels in Labels.</p>}
    </fieldset>
  </div>;
}

/** The legacy date pill popover: quick dates, date, time range and Repeat. */
function SchedulePanel({ schedule, onDate, onStart, onEnd, onRepeat, onCustom, onDone }: {
  schedule: ReturnType<typeof scheduleOf>;
  onDate(date: Date | undefined): void; onStart(time: string): void; onEnd(time: string): void;
  onRepeat(recurrence: Recurrence | undefined): void; onCustom(): void; onDone(): void;
}) {
  const [everyDays, setEveryDays] = useState("1");
  const anchor = schedule.date ?? new Date();
  const pick = (date: Date | undefined) => { onDate(date); onDone(); };
  const setEvery = () => { const n = parseInt(everyDays, 10); if (n > 0) onRepeat({ n, unit: "day", basedOn: "scheduled" }); };
  const current = schedule.recurrence;
  return <div className="schedule-panel" role="group" aria-label="Date and repeat">
    <div className="panel-list">
      {quickDateOptions().map(({ label, day, date }) => <button key={label} type="button" onClick={() => pick(date)}>{label}<span>{day}</span></button>)}
      <button type="button" onClick={() => pick(undefined)}>No Date</button>
    </div>
    <label>Date<input type="date" value={dateValue(schedule.date)} onChange={(event) => onDate(fromDateValue(event.target.value))} /></label>
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
          <select aria-label="Repeat unit" value={unit} onChange={(event) => setUnit(event.target.value as Recurrence["unit"])}>
            {UNITS.map(value => <option key={value} value={value}>{(count || 1) === 1 ? value : `${value}s`}</option>)}
          </select>
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
