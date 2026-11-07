// Provider events and the Calendars settings (ticket 20): the legacy event-item
// and calendar-account-card. Pure views; screens pass data and handlers.
// Imported Google Calendar events are read-only here — editing happens in
// Google Calendar, so each is a plain link to its htmlLink, never the task editor.
import type { CSSProperties, ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { openEvent, type CalendarAccountDto, type CalendarEventDto, type CalendarVisibilityInput } from "./calendar";
import { blockFor, labels } from "./schedule";
import type { ReadState } from "./views";

// A new tab in the browser; the system browser natively (openEvent).
const link = (event: CalendarEventDto) => ({ href: event.htmlLink ?? undefined, target: "_blank", rel: "noreferrer", onClick: (click: { preventDefault(): void; stopPropagation(): void }) => openEvent(event, click) });
const dot = (color: string): CSSProperties => ({ backgroundColor: color });
const tint = (color: string, percent: number): CSSProperties => ({ backgroundColor: `color-mix(in srgb, ${color} ${percent}%, transparent)` });

/** Legacy EventRow: list sections and all-day rows. */
export function EventRow({ event }: { event: CalendarEventDto }) {
  return <a className="event-row" {...link(event)}>
    <span className="event-dot" style={dot(event.color)} />
    <span className="event-title">{event.title}</span>
    {!event.allDay && <span className="event-time">{labels.time(new Date(event.start))}</span>}
  </a>;
}

/** Legacy EventChip: month cells. */
export function EventChip({ event }: { event: CalendarEventDto }) {
  return <a className="event-chip" style={tint(event.color, 20)} {...link(event)}>
    <span className="event-dot small" style={dot(event.color)} /><span className="event-title">{event.title}</span>
  </a>;
}

/** Legacy TimedEventBlock: schedule columns, placed like task blocks. */
export function EventBlock({ event, style }: { event: CalendarEventDto; style?: CSSProperties }) {
  const block = blockFor(event.start, event.end);
  return <a className="event-block" style={{ top: block.top, height: block.height, borderColor: event.color, ...tint(event.color, 15), ...style }} {...link(event)}>
    <span className="timed-title">{event.title}</span><span className="timed-range">{labels.time(block.start)}–{labels.time(block.end)}</span>
  </a>;
}

export interface CalendarActions {
  showEvents(accountId: string, showEvents: boolean): void;
  setVisible(accountId: string, calendar: CalendarVisibilityInput): void;
  resync(accountId: string): void;
  disconnect(accountId: string): void;
}

/** Legacy settings › Calendars: one card per linked Google account. `link` is the system-browser Google link button. */
export function CalendarSettings({ state, onRetry, actions, pending, error, link }: {
  state: ReadState<CalendarAccountDto[]>; onRetry: () => void; actions: CalendarActions;
  /** Account IDs with a write in flight (legacy disabled the card while pending). */
  pending: ReadonlySet<string>; error: string | null; link: ReactNode;
}) {
  let body: ReactNode;
  if (state.status === "pending") body = <p className="state" role="status">Loading calendars…</p>;
  else if (!state.data) body = <p className="error" role="alert">{state.error?.message ?? "Your calendars could not be loaded. Try again."} <button type="button" className="text-action" onClick={onRetry}>Try again</button></p>;
  else body = <>
    {state.data.length === 0 && <p className="setting-hint">No Google accounts connected yet. Sign in with Google to get started.</p>}
    {state.data.map(account => <AccountCard key={account.id} account={account} actions={actions} pending={pending.has(account.id)} link={link} />)}
  </>;
  return <section className="calendar-settings" aria-labelledby="calendars-title">
    <h2 id="calendars-title" className="settings-heading">Calendars</h2>
    {error && <p className="error" role="alert">{error}</p>}
    {body}
    <div className="calendar-link">
      <p className="setting-hint">Find out how to show events from multiple accounts.</p>
      {link}
    </div>
  </section>;
}

function AccountCard({ account, actions, pending, link }: { account: CalendarAccountDto; actions: CalendarActions; pending: boolean; link: ReactNode }) {
  if (account.needsConsent) return <div className="calendar-card">
    <div className="calendar-card-head"><span className="calendar-email">{account.email}</span>{link}</div>
    <p className="calendar-hint">Grant calendar access to show this account&apos;s events.</p>
  </div>;
  return <div className="calendar-card" aria-busy={pending || undefined}>
    <div className="calendar-card-head">
      <span className="calendar-email">{account.email}</span>
      <span className="calendar-status"><span className={account.hasSyncError ? "status-dot error" : "status-dot"} />{account.hasSyncError ? "Error" : "Live"}</span>
      <span className="calendar-card-actions">
        <button type="button" className="button ghost small" disabled={pending} onClick={() => actions.resync(account.id)}>Resync</button>
        <button type="button" className="button destructive small" disabled={pending} onClick={() => actions.disconnect(account.id)}>Disconnect</button>
      </span>
    </div>
    <p className="calendar-hint">Resync if calendars aren&apos;t up-to-date.</p>
    <label className="calendar-show">
      <span><span className="setting-title">Show events in Today/Upcoming</span><span className="setting-hint">Events are shown in Today and Upcoming.</span></span>
      <input type="checkbox" role="switch" className="switch" checked={account.showEvents} disabled={pending} onChange={(event) => actions.showEvents(account.id, event.target.checked)} />
    </label>
    <ul className="calendar-list">
      {account.calendars.map(cal => <li key={cal.id}>
        <span className="event-dot" style={dot(cal.color)} /><span className="calendar-name">{cal.summary}</span>
        <button type="button" className="icon-button" disabled={pending} aria-pressed={cal.enabled} aria-label={cal.enabled ? `Hide ${cal.summary}` : `Show ${cal.summary}`}
          onClick={() => actions.setVisible(account.id, { googleCalendarId: cal.id, summary: cal.summary, color: cal.color, visible: !cal.enabled })}>
          {cal.enabled ? <Eye /> : <EyeOff />}
        </button>
      </li>)}
    </ul>
  </div>;
}
