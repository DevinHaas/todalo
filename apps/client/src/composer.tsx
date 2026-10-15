import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState, type FormEvent } from "react";
import { CalendarIcon, Inbox, Plus, Sun, X } from "lucide-react";
import type { QuickAddMatch } from "@todalo/ramble/quick-add";
import {
  canonicalDateText, canonicalRecurrenceText, canonicalTimeText, highlightSegments, initialSyncState, quickAddTimeMatchText,
  spliceMatch, syncQuickAddFields, type QuickAddSyncState,
} from "@todalo/ramble/quick-add-sync";
import type { Recurrence } from "@todalo/ramble/recurrence";
import { operationId, timeInputValue, type NewTask } from "./tasks";
import {
  dateValue, dueDateLabel, fromDateValue, parseTitle, quickAddTask, quickDateOptions, repeatPresetsFor, scheduleOf,
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
export function Composer({ dueDate, dueDateEnd, destination, onCreate, onCancel, startOpen = false, smartDates: override }: {
  /** Initial due date (with time for a schedule slot); null starts undated (Inbox). */
  dueDate: () => string | null;
  /** End of a schedule slot (ticket 16). */
  dueDateEnd?: () => string | null;
  /** Date pill text while the seeded date is kept (Upcoming days, schedule slots). */
  destination?: string;
  onCreate: (task: NewTask) => Promise<unknown>;
  onCancel?: () => void;
  startOpen?: boolean;
  /** Overrides the SmartDates context (tests). */
  smartDates?: boolean;
}) {
  const account = useContext(SmartDates);
  const smartDates = override ?? account;
  const seed = () => seedState(dueDate(), dueDateEnd?.() ?? null);
  const [open, setOpen] = useState(startOpen);
  const [title, setTitle] = useState("");
  const [parsedTitle, setParsedTitle] = useState("");
  const [description, setDescription] = useState("");
  const [rejected, setRejected] = useState<ReadonlySet<string>>(new Set());
  const [sync, dispatch] = useReducer(syncQuickAddFields, undefined, seed);
  const [seeded] = useState(() => scheduleOf(sync).date);
  const [scheduling, setScheduling] = useState(false);
  const [customRepeat, setCustomRepeat] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const reset = () => { setTitle(""); setParsedTitle(""); setDescription(""); setRejected(new Set()); dispatch({ type: "seed", date: seeded, time: "" }); operation.current = null; };
  const close = () => { setOpen(false); reset(); setError(null); setScheduling(false); onCancel?.(); };
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

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || pending) return;
    const fields = quickAddTask(title, sync, parseTitle(title, smartDates, rejected));
    const task = {
      title: fields.title, ...(description.trim() && { description: description.trim() }), dueDate: fields.dueDate,
      ...(fields.dueDateEnd && { dueDateEnd: fields.dueDateEnd }), ...(fields.recurrence && { recurrence: fields.recurrence }),
    };
    const key = JSON.stringify(task);
    if (operation.current?.key !== key) operation.current = { key, id: operationId() };
    setPending(true); setError(null);
    try {
      await onCreate({ id: operation.current.id, ...task });
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
      <input aria-label="Description" placeholder="Description" value={description} onChange={(event) => setDescription(event.target.value)} />
      <div className="composer-pills">
        <button type="button" className={schedule.date ? "button outline small set" : "button outline small"} aria-expanded={scheduling} aria-label={`Date: ${label}${time ? ` ${time}` : ""}`} onClick={() => setScheduling(value => !value)}>
          {today ? <Sun /> : <CalendarIcon />}{label}{time && ` ${time}`}
        </button>
        {schedule.date && <button type="button" className="icon-button small" aria-label="Clear date" onClick={() => changeDate(undefined)}><X /></button>}
      </div>
      {scheduling && <SchedulePanel schedule={schedule} onDate={(date) => { changeDate(date); }} onStart={changeStart} onEnd={changeEnd}
        onRepeat={(recurrence) => { changeRepeat(recurrence); setScheduling(false); }} onCustom={() => { setCustomRepeat(true); setScheduling(false); }} onDone={() => setScheduling(false)} />}
      <div className="composer-footer">
        <span className="pill project"><Inbox />Inbox</span>
        <div className="composer-actions">
          <button type="button" className="button outline" onClick={close}>Cancel</button>
          <button type="submit" className="button" disabled={!title.trim() || pending}>{pending ? "Adding…" : "Add task"}</button>
        </div>
      </div>
    </form>
    {customRepeat && <CustomRepeatDialog recurrence={schedule.recurrence} onClose={() => setCustomRepeat(false)} onConfirm={(recurrence) => { changeRepeat(recurrence); setCustomRepeat(false); }} />}
  </>;
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
