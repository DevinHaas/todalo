import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

type DataAttributes = Partial<Record<`data-${string}`, string>>;

const ITEMS = "button:not(:disabled), input:not(:disabled)";

/**
 * A button that opens a floating panel under it (the web client's Popover):
 * a tap outside, Escape, or choosing something closes it. Escape stops there so
 * the composer or dialog around it stays open, and focus returns to the button.
 * The panel flips above, or to the right edge, when it would leave the screen.
 */
export function Popover({ label, trigger, className, triggerClassName = "chip", role = "dialog", after, data, children }: {
  /** The button's accessible name (its text is decoration). */
  label: string; trigger: ReactNode; className?: string; triggerClassName?: string;
  /** `menu` panels are a roving list: arrow keys move between their buttons. */
  role?: "dialog" | "menu";
  /** Sits inside the anchor after the button (a chip's clear ×). */
  after?: ReactNode; data?: DataAttributes;
  children: (close: (refocus?: boolean) => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const close = (refocus = true) => { setOpen(false); if (refocus) button.current?.focus(); };

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!anchor.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  useLayoutEffect(() => {
    const element = panel.current;
    if (!open || !element) return;
    const rect = anchor.current!.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - 12, above = rect.top - 12;
    const up = element.scrollHeight > below && above > below;
    element.style.maxHeight = `${Math.max(up ? above : below, 160)}px`;
    if (up) { element.style.top = "auto"; element.style.bottom = "calc(100% + .25rem)"; }
    if (rect.left + element.offsetWidth > window.innerWidth - 8) { element.style.left = "auto"; element.style.right = "0"; }
    (element.querySelector<HTMLElement>('[aria-checked="true"], [aria-pressed="true"]') ?? element.querySelector<HTMLElement>(ITEMS))?.focus({ preventScroll: true });
  }, [open]);

  function keys(event: KeyboardEvent) {
    if (!open) return;
    if (event.key === "Escape") { event.stopPropagation(); event.preventDefault(); close(); return; }
    if (role !== "menu" || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = [...panel.current!.querySelectorAll<HTMLElement>(ITEMS)];
    const current = items.indexOf(document.activeElement as HTMLElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    event.preventDefault(); event.stopPropagation();
    items[next]?.focus();
  }

  return <span ref={anchor} className={className ? `popover-anchor ${className}` : "popover-anchor"} onKeyDown={keys}>
    <button ref={button} type="button" className={triggerClassName} aria-label={label} aria-haspopup={role} aria-expanded={open} onClick={() => setOpen(value => !value)} {...data}>{trigger}</button>
    {after}
    {open && <div ref={panel} className="popover" role={role} aria-label={label} tabIndex={-1}>{children(close)}</div>}
  </span>;
}

export interface Option<T extends string | number> { value: T; label: string; icon?: ReactNode }

/** The custom select: a Popover menu of radio items replacing a native `<select>`. */
export function Dropdown<T extends string | number>({ label, value, options, onChange, className = "dropdown-trigger", triggerContent, chevron = true, data }: {
  label: string; value: T; options: Option<T>[]; onChange(value: T): void; className?: string;
  /** Replaces the selected option's icon and name on the button. */
  triggerContent?: ReactNode; chevron?: boolean; data?: DataAttributes;
}) {
  const current = options.find(option => option.value === value) ?? options[0];
  return <Popover label={`${label}: ${current?.label ?? ""}`} role="menu" triggerClassName={className} data={data}
    trigger={triggerContent ?? <>{current?.icon}<span>{current?.label}</span>{chevron && <ChevronDown className="chevron" />}</>}>
    {close => options.map(option => <button key={option.value} type="button" role="menuitemradio" aria-checked={option.value === value} className="popover-item"
      onClick={() => { onChange(option.value); close(); }}>{option.icon}<span>{option.label}</span>{option.value === value && <Check className="check" />}</button>)}
  </Popover>;
}

const weekdays = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const monthName = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });
const dayName = new Intl.DateTimeFormat("en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

/** A month grid (Monday first) for picking one day; dates are local midnight. */
export function Calendar({ selected, onSelect, now = new Date() }: { selected?: Date; onSelect(date: Date): void; now?: Date }) {
  const start = selected ?? now;
  const [month, setMonth] = useState(() => new Date(start.getFullYear(), start.getMonth(), 1));
  const blanks = (month.getDay() + 6) % 7;
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const step = (by: number) => setMonth(current => new Date(current.getFullYear(), current.getMonth() + by, 1));
  return <div className="date-grid" role="group" aria-label="Calendar">
    <div className="date-head">
      <button type="button" className="icon-button" aria-label="Previous month" onClick={() => step(-1)}><ChevronLeft /></button>
      <span role="status">{monthName.format(month)}</span>
      <button type="button" className="icon-button" aria-label="Next month" onClick={() => step(1)}><ChevronRight /></button>
    </div>
    <div className="date-days">
      {weekdays.map(day => <span key={day} aria-hidden="true">{day}</span>)}
      {Array.from({ length: blanks }, (_, index) => <span key={`blank-${index}`} />)}
      {Array.from({ length: count }, (_, index) => {
        const date = new Date(month.getFullYear(), month.getMonth(), index + 1);
        return <button key={index} type="button" aria-label={dayName.format(date)} aria-pressed={selected?.toDateString() === date.toDateString()}
          data-today={date.toDateString() === now.toDateString() || undefined} onClick={() => onSelect(date)}>{index + 1}</button>;
      })}
    </div>
  </div>;
}
