import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { adaptBinding, defaultPreferences, effectiveBindings, keyboardCommands, suggestBinding, validatePreferences, type KeyboardPreferences, type Platform } from "@todalo/ramble/keyboard";
import { editKeyboardBindings, releaseBinding } from "@todalo/ramble/keyboard-edit";
import { matchesShortcut, matchesShortcutFilter, type ShortcutFilter } from "@todalo/ramble/keyboard-search";
import { createShortcutRecorder } from "@todalo/ramble/keyboard-recorder";
import { clientCommands } from "./keyboard";
import { releaseFocus } from "./software-keyboard";
import { cn } from "./ui";

// Pure views for ticket 19 (no runtime imports): the legacy shortcut help sheet
// and Settings › Keyboard shortcuts.

const spoken: Record<string, string> = { Meta: "Command", Ctrl: "Control", Alt: "Option", ArrowUp: "Up arrow", ArrowDown: "Down arrow", ArrowLeft: "Left arrow", ArrowRight: "Right arrow", Escape: "Escape", Backspace: "Backspace" };
const shown: Record<string, string> = { Meta: "⌘", Ctrl: "Ctrl", Alt: "⌥", Shift: "⇧", ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", Escape: "Esc", Backspace: "⌫", Space: "Space" };
const label = (binding: string) => binding.split(" then ").map(step => step.split("+").map(key => spoken[key] ?? key).join(" plus ")).join(" then ");
const glyph = (key: string) => shown[key] ?? (key.length === 1 ? key.toUpperCase() : key);
/** "⌘K", "G then T": a binding as one line of text (the conflict message). */
const text = (binding: string, platform: Platform) => adaptBinding(binding, platform).split(" then ").map(step => step.split("+").map(glyph).join(platform === "mac" ? "" : "+")).join(" then ");
const keycap = "ml-0 inline-flex h-[1.375rem] min-w-[1.375rem] items-center justify-center rounded-[5px] border border-border bg-background px-1.5 font-sans text-xs font-medium leading-none text-foreground shadow-[0_1px_0_var(--color-border)] dark:border-white/10 dark:bg-white/10 dark:shadow-none";

/** Keys as keycaps; screen readers hear one spoken label per binding instead. */
export function ShortcutKeys({ bindings }: { bindings: string[] }) {
  return <span className="shortcut-keys">
    {bindings.map((binding, index) => <span key={`${binding}-${index}`} role="img" aria-label={label(binding)} className="inline-flex items-center gap-1">
      {index > 0 && <span className="text-xs text-muted-foreground" aria-hidden="true">or</span>}
      {binding.split(" then ").map((step, stepIndex) => <span key={stepIndex} aria-hidden="true" className="inline-flex items-center gap-0.5">
        {stepIndex > 0 && <span className="text-xs text-muted-foreground">then</span>}
        {step.split("+").map((key, keyIndex) => <kbd key={keyIndex} className={keycap}>{glyph(key)}</kbd>)}
      </span>)}
    </span>)}
  </span>;
}

export type TaskMenuAction = "edit" | "date" | "clear-date" | "complete" | "delete";
const menuActions: [TaskMenuAction, string][] = [["edit", "Edit"], ["date", "Choose date"], ["clear-date", "Clear date"], ["complete", "Complete"], ["delete", "Delete"]];

/** Legacy "Task actions" dialog (the `.` key): each choice runs what the row's own control or key does. */
export function TaskMenu({ title, onChoose, onClose }: { title: string; onChoose: (action: TaskMenuAction) => void; onClose: () => void }) {
  return <div className="dialog-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-labelledby="task-menu-title" aria-describedby="task-menu-task" className="dialog task-menu" onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}>
      <h2 id="task-menu-title" className="dialog-title">Task actions</h2>
      <p id="task-menu-task" className="state">{title}</p>
      {menuActions.map(([action, name], index) => <button key={action} type="button" className="button outline" autoFocus={index === 0} onClick={() => onChoose(action)}>{name}</button>)}
    </div>
  </div>;
}

/** Legacy "Keyboard Shortcuts" sheet: searchable, grouped, Escape or × closes. */
export function ShortcutHelp({ bindings, onCustomize, onClose }: { bindings: (id: string) => string[]; onCustomize: () => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const listed = clientCommands.filter(command => bindings(command.id).length && matchesShortcut(command, bindings(command.id), query));
  return <div className="dialog-backdrop sheet-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-labelledby="shortcut-help-title" className="dialog sheet shortcut-help" onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}>
      <div className="dialog-header"><h2 id="shortcut-help-title" className="dialog-title">Keyboard shortcuts</h2>
        <button type="button" className="icon-button" aria-label="Close keyboard shortcuts" onClick={onClose}><X /></button></div>
      <button type="button" className="text-action" onClick={onCustomize}>Customize shortcuts in your account</button>
      <input ref={releaseFocus} autoFocus aria-label="Search keyboard shortcuts help" placeholder="Search shortcuts…" value={query} onChange={(event) => setQuery(event.target.value)} />
      <div className="shortcut-list">
        {!listed.length && <p role="status" className="state">No shortcuts match your search.</p>}
        {[...new Set(listed.map(command => command.group))].map(group => <section key={group}>
          <h3 className="section-heading">{group}</h3>
          {listed.filter(command => command.group === group).map(command => <div key={command.id} className="shortcut-row"><span>{command.label}</span><ShortcutKeys bindings={bindings(command.id)} /></div>)}
        </section>)}
      </div>
    </div>
  </div>;
}


const profiles: { value: "portable" | Platform; label: string }[] = [
  { value: "portable", label: "All platforms" }, { value: "mac", label: "macOS" }, { value: "windows", label: "Windows" }, { value: "linux", label: "Linux" },
];
const filters: { id: ShortcutFilter; label: string }[] = [
  { id: "all", label: "All" }, { id: "assigned", label: "Assigned" }, { id: "custom", label: "Custom" }, { id: "unassigned", label: "Unassigned" },
];
const modifierCaps = (platform: Platform): [keyof Held, string][] => platform === "mac"
  ? [["Ctrl", "⌃"], ["Alt", "⌥"], ["Shift", "⇧"], ["Meta", "⌘"]] : [["Ctrl", "Ctrl"], ["Alt", "Alt"], ["Shift", "⇧"]];
type Held = { Ctrl: boolean; Alt: boolean; Shift: boolean; Meta: boolean };
const released: Held = { Ctrl: false, Alt: false, Shift: false, Meta: false };
/** A shortcut field: one of an action's bindings, or `index: null` for a new one. */
type Slot = { id: string; index: number | null };
type Notice = { id: string; message: string } | { id: string; binding: string; next: KeyboardPreferences; others: string[] };
const bare = "cursor-pointer appearance-none border-0 bg-transparent font-[inherit] text-inherit";
const textButton = "rounded-md px-1.5 py-0.5 text-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring";

/**
 * Settings › Keyboard shortcuts, macOS style: a card per group, one row per
 * action. Choosing a shortcut records the next chord (or a "g then t"
 * sequence) and saves it to the account at once; a key already in use asks
 * to replace. Recording swallows keys in the capture phase, so no command
 * runs meanwhile. Per-platform profiles edit one platform's keys only.
 */
export function ShortcutSettings({ preferences: saved, platform, syncError, onRetry, onSave, onHelp }: {
  preferences: KeyboardPreferences; platform: Platform; syncError: string | null; onRetry: () => void;
  onSave: (preferences: KeyboardPreferences) => Promise<unknown>; onHelp: () => void;
}) {
  const [draft, setDraft] = useState<KeyboardPreferences | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ShortcutFilter>("all");
  const [profile, setProfile] = useState<"portable" | Platform>("portable");
  const [selected, setSelected] = useState<Slot | null>(null);
  const [recording, setRecording] = useState(false);
  const [partial, setPartial] = useState<string | null>(null);
  const [held, setHeld] = useState<Held>(released);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const preferences = draft ?? saved;
  const latest = useRef(preferences);
  latest.current = preferences;
  const shownPlatform = profile === "portable" ? platform : profile;
  const errors = useMemo(() => validatePreferences(preferences), [preferences]);
  const conflicting = new Set(errors.flatMap(item => [item.commandId, ...(item.otherId ? [item.otherId] : [])]));
  const matches = clientCommands.filter(command => matchesShortcut(command, effectiveBindings(command.id, preferences, shownPlatform), query)
    && matchesShortcutFilter(command, preferences, shownPlatform, filter, conflicting));
  const name = (id: string) => keyboardCommands.find(command => command.id === id)?.label ?? id;

  // Every change saves at once; a document that still has problems (an old conflict) stays a local draft until they're fixed.
  async function commit(next: KeyboardPreferences) {
    setDraft(next); setNotice(null); setError(null);
    if (validatePreferences(next).length) return;
    setSaving(true);
    try { await onSave(next); setDraft(current => current === next ? null : current); }
    catch (failure) {
      setDraft(current => current === next ? null : current);
      setError(failure instanceof Error ? failure.message : "Your change could not be saved. Try again.");
    } finally { setSaving(false); }
  }

  function apply(slot: Slot, binding: string) {
    const base = latest.current;
    const next = editKeyboardBindings(base, slot.id, profile, slot.index === null ? { add: binding } : { replace: slot.index, binding });
    const known = new Set(validatePreferences(base).map(item => JSON.stringify(item)));
    const fresh = validatePreferences(next).filter(item => !known.has(JSON.stringify(item)) && (item.commandId === slot.id || item.otherId === slot.id));
    const problem = fresh.find(item => !item.otherId);
    if (problem) return setNotice({ id: slot.id, message: problem.message });
    const others = [...new Set(fresh.map(item => item.commandId === slot.id ? item.otherId! : item.commandId))];
    if (others.length) return setNotice({ id: slot.id, binding, next, others });
    setSelected({ id: slot.id, index: slot.index ?? effectiveBindings(slot.id, next, shownPlatform).length - 1 });
    void commit(next);
  }

  useEffect(() => {
    if (!selected) return;
    const stop = () => { setRecording(false); setPartial(null); setHeld(released); };
    const record = createShortcutRecorder(profile, shownPlatform, binding => { stop(); apply(selected, binding); },
      { onStep: setPartial, onCancel: () => { stop(); if (selected.index === null) setSelected(null); } });
    const modifiers = (event: KeyboardEvent) => setHeld({ Ctrl: event.ctrlKey, Alt: event.altKey, Shift: event.shiftKey, Meta: event.metaKey });
    const keydown = (event: KeyboardEvent) => { modifiers(event); record(event); };
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest("[data-shortcut-field]")) return;
      record.cancel(); stop(); setSelected(null);
    };
    const blur = () => { record.cancel(); stop(); };
    window.addEventListener("pointerdown", outside, true);
    if (recording) {
      window.addEventListener("keydown", keydown, true);
      window.addEventListener("keyup", modifiers, true);
      window.addEventListener("blur", blur);
    }
    return () => {
      record.cancel();
      window.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("keydown", keydown, true);
      window.removeEventListener("keyup", modifiers, true);
      window.removeEventListener("blur", blur);
    };
    // apply reads the latest preferences through a ref.
  }, [selected, recording, profile, shownPlatform]);

  function choose(slot: Slot) { setNotice(null); setError(null); setSelected(slot); setRecording(true); setPartial(null); }
  function clear(slot: Slot) {
    setSelected(null); setRecording(false);
    if (slot.index !== null) void commit(editKeyboardBindings(latest.current, slot.id, profile, { remove: slot.index }));
  }

  function field(command: { id: string; label: string }, binding: string | null, index: number | null) {
    const active = selected?.id === command.id && selected.index === index;
    const keys = active && partial ? adaptBinding(partial, shownPlatform) : binding;
    const slot = { id: command.id, index };
    return <span key={index ?? "new"} data-shortcut-field className="relative inline-flex"
      onKeyDown={(event) => { if (active && !recording && event.key === "Escape") { event.stopPropagation(); setSelected(null); } }}>
      <span className={cn("inline-flex items-center rounded-lg border transition-colors [&_button]:outline-none", active ? "border-border-strong bg-background shadow-xs dark:bg-white/5" : "border-transparent")}>
        <button type="button" aria-label={`Shortcut for ${command.label}: ${binding ? label(binding) : "none"}. Press to change`}
          className={cn(bare, "inline-flex min-h-8 items-center rounded-lg px-1.5 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring")}
          onClick={() => choose(slot)}>
          {keys ? <ShortcutKeys bindings={[keys]} /> : <span className="px-1 text-sm text-muted-foreground">Type shortcut…</span>}
          {active && partial && <span className="ml-1 text-xs text-muted-foreground" aria-hidden="true">then…</span>}
        </button>
        {active && <button type="button" aria-label={binding ? `Remove ${label(binding)} from ${command.label}` : "Cancel new shortcut"}
          className={cn(bare, "mr-1 inline-flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring")}
          onClick={() => clear(slot)}><X className="size-3.5" /></button>}
      </span>
      {active && recording && <div role="status" aria-live="polite"
        className="absolute bottom-full right-0 z-20 mb-2.5 w-max min-w-44 rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-lg">
        <span className="sr-only">Recording a shortcut for {command.label}{partial ? `: ${label(adaptBinding(partial, shownPlatform))}, waiting for a next key` : ""}. Press the keys, or Escape to close.</span>
        <div className="flex justify-center gap-1.5" aria-hidden="true">
          {modifierCaps(shownPlatform).map(([key, cap]) => <kbd key={key} className={cn(keycap, "h-7 min-w-7 text-sm transition-colors", held[key] ? "border-primary bg-primary text-primary-foreground dark:border-primary dark:bg-primary" : "text-muted-foreground")}>{cap}</kbd>)}
        </div>
        <p className="mt-2 text-center text-xs text-muted-foreground" aria-hidden="true">{partial ? "…then the next key" : "…and a key"}</p>
        <div className="mt-3 flex items-center justify-between gap-4 border-t border-border pt-2 text-xs text-muted-foreground">
          <button type="button" className={cn(bare, "hover:text-foreground")} onClick={() => { setRecording(false); setPartial(null); if (index === null) setSelected(null); }}>Close</button>
          <kbd className={keycap} aria-hidden="true">esc</kbd>
        </div>
        <span aria-hidden="true" className="absolute -bottom-1.5 right-5 size-3 rotate-45 border-r border-b border-border bg-popover" />
      </div>}
    </span>;
  }

  return <section id="keyboard-shortcuts" className="grid gap-5 text-left" aria-labelledby="keyboard-shortcuts-title">
    <h2 id="keyboard-shortcuts-title">Keyboard shortcuts</h2>
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Choose a shortcut to change it. Changes save to your account.</p>
        <button type="button" className={cn(bare, textButton, "shrink-0 text-muted-foreground")} onClick={onHelp}>Shortcut help</button>
      </div>
      <label className="relative block">
        <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input aria-label="Search keyboard shortcuts" placeholder="Search shortcuts…" value={query} onChange={(event) => setQuery(event.target.value)}
          className="h-9 w-full rounded-lg border border-border bg-field pr-3 pl-9 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring" />
      </label>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filter shortcuts">
          {[...filters, ...(conflicting.size || filter === "conflicts" ? [{ id: "conflicts" as const, label: `Conflicts${conflicting.size ? ` (${conflicting.size})` : ""}` }] : [])].map(item =>
            <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}
              className={cn(bare, "rounded-full px-3 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-pressed:bg-foreground aria-pressed:text-background")}>{item.label}</button>)}
        </div>
        <select aria-label="Binding profile" value={profile} onChange={(event) => { setProfile(event.target.value as "portable" | Platform); setSelected(null); }}
          title="All platforms keeps each platform’s defaults when adding shortcuts; one platform changes only its keys."
          className="h-7 min-h-0 w-auto cursor-pointer rounded-md border-0 bg-transparent py-0 px-1.5 shadow-none text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
          {profiles.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </div>
    </div>
    {syncError && <p role="alert" className="text-sm text-destructive">{syncError} <button type="button" className={cn(bare, textButton)} onClick={onRetry}>Retry sync</button></p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {draft && errors.length > 0 && <p role="status" className="text-sm text-muted-foreground">Resolve the problems below to save your shortcuts.</p>}
    <p role="status" className="sr-only">{saving ? "Saving shortcuts…" : ""}</p>
    {[...new Set(matches.map(command => command.group))].map(group => <div key={group} className="grid gap-1.5">
      <h3 className="px-1 text-[0.8125rem] font-semibold text-foreground">{group}</h3>
      <div className="divide-y divide-border-subtle rounded-xl border border-border-subtle bg-muted/50 dark:bg-white/[0.04]">
        {matches.filter(command => command.group === group).map(command => {
          const bindings = effectiveBindings(command.id, preferences, shownPlatform);
          const adding = selected?.id === command.id && selected.index === null;
          const problems = errors.filter(item => item.commandId === command.id || item.otherId === command.id);
          const suggestion = problems.length ? suggestBinding(command.id, preferences, shownPlatform) : null;
          const here = notice?.id === command.id ? notice : null;
          return <div key={command.id} className="group/row flex min-h-11 flex-wrap items-center gap-x-4 gap-y-1 px-3.5 py-1.5">
            <span className="min-w-0 flex-1 text-sm">{command.label}</span>
            <span className="flex flex-wrap items-center justify-end gap-1">
              {bindings.map((binding, index) => field(command, binding, index))}
              {adding && field(command, null, null)}
              {!bindings.length && !adding && <button type="button" aria-label={`Shortcut for ${command.label}: none. Press to add`} onClick={() => choose({ id: command.id, index: null })}
                className={cn(bare, "rounded-lg px-2 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring")}>Add Hotkey</button>}
              {bindings.length > 0 && !adding && <button type="button" aria-label={`Add another shortcut for ${command.label}`} onClick={() => choose({ id: command.id, index: null })}
                className={cn(bare, "rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:text-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring", bindings.length < 2 && "opacity-0 group-hover/row:opacity-100")}>Add</button>}
            </span>
            {here && <div role="alert" className="flex basis-full flex-wrap items-center justify-end gap-x-2 pb-1 text-sm">
              {"message" in here ? <span className="text-destructive">{here.message}</span> : <>
                <span className="text-muted-foreground">{text(here.binding, shownPlatform)} is used by {here.others.map(name).join(", ")}. Replace?</span>
                <button type="button" className={cn(bare, textButton)} onClick={() => { setSelected(null); void commit(releaseBinding(here.next, command.id, profile, here.binding)); }}>Replace</button>
                <button type="button" className={cn(bare, textButton, "text-muted-foreground")} onClick={() => setNotice(null)}>Cancel</button>
              </>}
            </div>}
            {problems.length > 0 && <div role="alert" className="grid basis-full justify-items-end gap-0.5 pb-1 text-sm text-destructive">
              {problems.map((item, index) => <p key={index}>{item.platform}: {item.commandId === command.id ? item.message : `Conflicts with ${name(item.commandId)}.`} {item.otherId && <button type="button" className={cn(bare, textButton)} onClick={() => void commit(editKeyboardBindings(preferences, item.commandId === command.id ? item.otherId! : item.commandId, profile, { bindings: [] }))}>Remove conflicting assignment</button>}</p>)}
              {suggestion && <button type="button" className={cn(bare, textButton)} onClick={() => void commit(editKeyboardBindings(preferences, command.id, profile, { bindings: [suggestion] }))}>Use available alternative {suggestion}</button>}
            </div>}
          </div>;
        })}
      </div>
    </div>)}
    {matches.length === 0 && <p role="status" className="text-sm text-muted-foreground">No shortcuts match this search and filter.</p>}
    <div className="text-sm">
      {confirmReset ? <p role="alert" className="text-muted-foreground">Reset every shortcut to its default?{" "}
        <button type="button" className={cn(bare, textButton)} onClick={() => { setConfirmReset(false); setSelected(null); void commit(defaultPreferences()); }}>Reset all</button>
        <button type="button" className={cn(bare, textButton, "text-muted-foreground")} onClick={() => setConfirmReset(false)}>Cancel</button></p>
        : <button type="button" className={cn(bare, textButton, "px-1 text-muted-foreground")} onClick={() => setConfirmReset(true)}>Reset all shortcuts</button>}
    </div>
  </section>;
}
