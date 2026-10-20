import { useEffect, useMemo, useState } from "react";
import { Plus, RotateCcw, X } from "lucide-react";
import { defaultPreferences, effectiveBindings, keyboardCommands, suggestBinding, validatePreferences, type KeyboardPreferences, type Platform } from "@todalo/ramble/keyboard";
import { editKeyboardBindings } from "@todalo/ramble/keyboard-edit";
import { matchesShortcut, matchesShortcutFilter, type ShortcutFilter } from "@todalo/ramble/keyboard-search";
import { createShortcutRecorder } from "@todalo/ramble/keyboard-recorder";
import { clientCommands } from "./keyboard";
import { releaseFocus } from "./software-keyboard";

// Pure views for ticket 19 (no runtime imports): the legacy shortcut help sheet
// and Settings › Keyboard shortcuts, on the client's plain CSS.

const spoken: Record<string, string> = { Meta: "Command", Ctrl: "Control", Alt: "Option", ArrowUp: "Up arrow", ArrowDown: "Down arrow", ArrowLeft: "Left arrow", ArrowRight: "Right arrow", Escape: "Escape", Backspace: "Backspace" };
const shown: Record<string, string> = { Meta: "⌘", Ctrl: "Ctrl", Alt: "⌥", Shift: "⇧", ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", Escape: "Esc", Backspace: "⌫", Space: "Space" };
const label = (binding: string) => binding.split(" then ").map(step => step.split("+").map(key => spoken[key] ?? key).join(" plus ")).join(" then ");

/** Keys as <kbd>; screen readers hear one spoken label per binding instead. */
export function ShortcutKeys({ bindings }: { bindings: string[] }) {
  return <span className="shortcut-keys">
    {bindings.map((binding, index) => <span key={`${binding}-${index}`} role="img" aria-label={label(binding)}>
      {index > 0 && <span className="muted-count" aria-hidden="true">or </span>}
      {binding.split(" then ").map((step, stepIndex) => <span key={stepIndex} aria-hidden="true">
        {stepIndex > 0 && <span className="muted-count"> then </span>}
        {step.split("+").map((key, keyIndex) => <kbd key={keyIndex}>{shown[key] ?? (key.length === 1 ? key.toUpperCase() : key)}</kbd>)}
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
  return <div className="dialog-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-labelledby="shortcut-help-title" className="dialog shortcut-help" onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}>
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

const filters: { id: ShortcutFilter; label: string }[] = [
  { id: "all", label: "All" }, { id: "assigned", label: "Assigned" }, { id: "custom", label: "Custom" }, { id: "unassigned", label: "Unassigned" },
];

/**
 * Legacy Settings › Keyboard shortcuts: record (the next chord), add, remove,
 * restore per action, per-platform profiles, conflict and reserved-key errors
 * with a fix, then one Save for the account. Recording swallows the key in the
 * capture phase, so no command runs while a shortcut is being recorded.
 */
export function ShortcutSettings({ preferences: saved, platform, syncError, onRetry, onSave, onHelp }: {
  preferences: KeyboardPreferences; platform: Platform; syncError: string | null; onRetry: () => void;
  onSave: (preferences: KeyboardPreferences) => Promise<unknown>; onHelp: () => void;
}) {
  const [draft, setDraft] = useState<KeyboardPreferences | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ShortcutFilter>("all");
  const [profile, setProfile] = useState<"portable" | Platform>("portable");
  const [recording, setRecording] = useState<{ id: string; replace?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const preferences = draft ?? saved;
  const shownPlatform = profile === "portable" ? platform : profile;
  const errors = useMemo(() => validatePreferences(preferences), [preferences]);
  const conflicting = new Set(errors.flatMap(item => [item.commandId, ...(item.otherId ? [item.otherId] : [])]));
  const matches = clientCommands.filter(command => matchesShortcut(command, effectiveBindings(command.id, preferences, shownPlatform), query)
    && matchesShortcutFilter(command, preferences, shownPlatform, filter, conflicting));
  const busy = Boolean(recording) || saving;

  useEffect(() => {
    if (!recording) return;
    const capture = createShortcutRecorder(profile, shownPlatform, binding => {
      setDraft(current => editKeyboardBindings(current ?? saved, recording.id, profile, recording.replace !== undefined ? { replace: recording.replace, binding } : { add: binding }));
      setDone(false); setError(null); setRecording(null);
    });
    const cancel = () => setRecording(null);
    const outside = (event: PointerEvent) => { if (!(event.target instanceof Element) || !event.target.closest("[data-shortcut-recording]")) cancel(); };
    window.addEventListener("keydown", capture, true);
    window.addEventListener("pointerdown", outside, true);
    window.addEventListener("blur", cancel);
    return () => { window.removeEventListener("keydown", capture, true); window.removeEventListener("pointerdown", outside, true); window.removeEventListener("blur", cancel); };
  }, [recording, profile, shownPlatform, saved]);

  function edit(id: string, operation: Parameters<typeof editKeyboardBindings>[3]) {
    setDone(false); setError(null);
    setDraft(current => editKeyboardBindings(current ?? saved, id, profile, operation));
  }
  const name = (id: string) => keyboardCommands.find(command => command.id === id)?.label ?? id;

  return <section id="keyboard-shortcuts" className="shortcut-settings" aria-labelledby="keyboard-shortcuts-title">
    <div className="dialog-header"><h2 id="keyboard-shortcuts-title" className="setting-title">Keyboard shortcuts</h2>
      <button type="button" className="button outline small" onClick={onHelp}>Shortcut help</button></div>
    <p className="setting-hint">Choose a shortcut to record a new one, or add another with +. Every action also has a button. Save to sync shortcuts with your account.</p>
    <div className="shortcut-filters">
      <input aria-label="Search keyboard shortcuts" placeholder="Search shortcuts…" disabled={busy} value={query} onChange={(event) => setQuery(event.target.value)} />
      <label>Platform <select aria-label="Binding profile" value={profile} disabled={busy} onChange={(event) => setProfile(event.target.value as typeof profile)}>
        <option value="portable">All platforms</option><option value="mac">macOS</option><option value="windows">Windows</option><option value="linux">Linux</option>
      </select></label>
    </div>
    <div className="shortcut-filters" role="group" aria-label="Filter shortcuts">
      {[...filters, ...(conflicting.size || filter === "conflicts" ? [{ id: "conflicts" as const, label: `Conflicts${conflicting.size ? ` (${conflicting.size})` : ""}` }] : [])].map(item =>
        <button key={item.id} type="button" className="button outline small" aria-pressed={filter === item.id} disabled={busy} onClick={() => setFilter(item.id)}>{item.label}</button>)}
    </div>
    {syncError && <p role="alert" className="error">{syncError} <button type="button" className="text-action" onClick={onRetry}>Retry sync</button></p>}
    {[...new Set(matches.map(command => command.group))].map(group => <div key={group}>
      <h3 className="section-heading">{group}</h3>
      {matches.filter(command => command.group === group).map(command => {
        const bindings = effectiveBindings(command.id, preferences, shownPlatform);
        const problems = errors.filter(item => item.commandId === command.id || item.otherId === command.id);
        const suggestion = problems.length ? suggestBinding(command.id, preferences, shownPlatform) : null;
        const here = recording?.id === command.id;
        return <div key={command.id} className="shortcut-row">
          <span>{command.label}</span>
          <span className="shortcut-actions">
            {bindings.map((binding, index) => <span key={`${binding}-${index}`} className="shortcut-chip">
              <button type="button" aria-label={`Change ${label(binding)} for ${command.label}`} disabled={busy} onClick={() => setRecording({ id: command.id, replace: index })}>
                {here && recording?.replace === index ? <span data-shortcut-recording role="status">Press keys…</span> : <ShortcutKeys bindings={[binding]} />}
              </button>
              <button type="button" className="icon-button" aria-label={`Remove ${label(binding)} from ${command.label}`} disabled={busy} onClick={() => edit(command.id, { remove: index })}><X /></button>
            </span>)}
            {!bindings.length && !here && <button type="button" className="button outline small" aria-label={`Assign shortcut to ${command.label}`} disabled={busy} onClick={() => setRecording({ id: command.id })}>Unassigned</button>}
            {here && recording?.replace === undefined && <span data-shortcut-recording role="status" className="shortcut-chip">Press keys…</span>}
            <button type="button" className="icon-button" aria-label={`Add shortcut for ${command.label}`} disabled={busy} onClick={() => setRecording({ id: command.id })}><Plus /></button>
            <button type="button" className="icon-button" aria-label={`Restore defaults for ${command.label}`} disabled={busy} onClick={() => edit(command.id, { reset: true })}><RotateCcw /></button>
          </span>
          {problems.length > 0 && <div role="alert" className="form-error shortcut-problems">
            {problems.map((item, index) => <p key={index}>{item.platform}: {item.commandId === command.id ? item.message : `Conflicts with ${name(item.commandId)}.`} {item.otherId && <button type="button" className="text-action" onClick={() => edit(item.commandId === command.id ? item.otherId! : item.commandId, { bindings: [] })}>Remove conflicting assignment</button>}</p>)}
            {suggestion && <button type="button" className="text-action" onClick={() => edit(command.id, { bindings: [suggestion] })}>Use available alternative {suggestion}</button>}
          </div>}
        </div>;
      })}
    </div>)}
    {matches.length === 0 && <p role="status" className="state">No shortcuts match this search and filter.</p>}
    {error && <p role="alert" className="error">{error} Your draft is kept; try Save again.</p>}
    {done && <p role="status" className="state">Shortcuts saved.</p>}
    <div className="shortcut-filters">
      <button type="button" className="button" disabled={!draft || errors.length > 0 || busy} onClick={async () => {
        setSaving(true); setError(null);
        try { await onSave(preferences); setDraft(null); setDone(true); }
        catch (failure) { setError(failure instanceof Error ? failure.message : "Your changes could not be saved. Try again."); }
        finally { setSaving(false); }
      }}>{saving ? "Saving…" : "Save shortcuts"}</button>
      <button type="button" className="button outline" disabled={saving} onClick={() => { setDraft(null); setRecording(null); setError(null); setDone(false); }}>Cancel changes</button>
      <button type="button" className="button ghost" disabled={busy} onClick={() => { setDraft(defaultPreferences()); setDone(false); setError(null); }}>Reset all shortcuts</button>
    </div>
  </section>;
}
