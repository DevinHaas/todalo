"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, RotateCcw, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { keyboardCommands, defaultPreferences, effectiveBindings, validatePreferences, suggestBinding, type Platform, type KeyboardPreferences } from "@/lib/keyboard";
import { useKeyboard, ShortcutKeys } from "./keyboard-provider";
import { editKeyboardBindings } from "@/lib/keyboard-edit";
import { matchesShortcut, matchesShortcutFilter, type ShortcutFilter } from "@/lib/keyboard-search";
import { createShortcutRecorder } from "@/lib/keyboard-recorder";

const filters: { id: ShortcutFilter; label: string }[] = [
  { id: "all", label: "All" }, { id: "assigned", label: "Assigned" },
  { id: "custom", label: "Custom" }, { id: "unassigned", label: "Unassigned" },
];
const iconButton = "inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40";

export function ShortcutSettings() {
  const keyboard = useKeyboard();
  const [draft, setDraft] = useState<KeyboardPreferences | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ShortcutFilter>("all");
  const [profile, setProfile] = useState<"portable" | Platform>("portable");
  const [recording, setRecording] = useState<{ id: string; replace?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const preferences = draft ?? keyboard.preferences;
  const platform = profile === "portable" ? keyboard.platform : profile;
  const errors = useMemo(() => validatePreferences(preferences), [preferences]);
  const conflictingIds = new Set(errors.flatMap(item => [item.commandId, ...(item.otherId ? [item.otherId] : [])]));
  const matches = keyboardCommands.filter(command => command.availability === "available"
    && matchesShortcut(command, effectiveBindings(command.id, preferences, platform), query)
    && matchesShortcutFilter(command, preferences, platform, filter, conflictingIds));
  const isRecording = Boolean(recording);
  const setProviderRecording = keyboard.setRecording;

  useEffect(() => {
    if (!recording) return;
    setProviderRecording(true);
    const capture = createShortcutRecorder(profile, platform, binding => {
      setDraft(current => editKeyboardBindings(current ?? keyboard.preferences, recording.id, profile,
        recording.replace !== undefined ? { replace: recording.replace, binding } : { add: binding }));
      setSaved(false); setError(null); setRecording(null);
    });
    const cancel = () => setRecording(null);
    const outside = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest("[data-shortcut-recording]")) cancel();
    };
    window.addEventListener("keydown", capture, true);
    window.addEventListener("pointerdown", outside, true);
    window.addEventListener("blur", cancel);
    return () => {
      setProviderRecording(false);
      window.removeEventListener("keydown", capture, true);
      window.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("blur", cancel);
    };
  }, [recording, setProviderRecording, profile, platform, keyboard.preferences]);

  function edit(id: string, operation: Parameters<typeof editKeyboardBindings>[3]) {
    setSaved(false); setError(null);
    setDraft(current => editKeyboardBindings(current ?? keyboard.preferences, id, profile, operation));
  }

  return <section id="keyboard-shortcuts" className="space-y-5 border-t pt-6 font-sans">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">Keyboard shortcuts</h2>
      <Button variant="outline" onClick={keyboard.openHelp}>Shortcut help</Button>
    </div>
    <p className="max-w-prose text-sm text-muted-foreground">Click a shortcut to change it, or add another with +. Remove every shortcut to leave an action unassigned. Save changes to sync with your account.</p>
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-0 flex-[1_1_15rem]">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input aria-label="Search keyboard shortcuts" placeholder="Search shortcuts…" disabled={isRecording} value={query} onChange={event => setQuery(event.target.value)} className="pl-9" />
      </div>
      <label className="flex min-w-0 flex-wrap items-center gap-2 text-sm">Platform
        <select aria-label="Binding profile" value={profile} disabled={isRecording} onChange={event => setProfile(event.target.value as typeof profile)} className="min-w-0 max-w-full rounded-md border bg-background px-2 py-2">
          <option value="portable">All platforms</option><option value="mac">macOS</option><option value="windows">Windows</option><option value="linux">Linux</option>
        </select>
      </label>
    </div>
    <div className="flex flex-wrap gap-2" role="group" aria-label="Filter shortcuts">
      {[...filters, ...(conflictingIds.size || filter === "conflicts" ? [{ id: "conflicts" as const, label: "Conflicts" + (conflictingIds.size ? " (" + conflictingIds.size + ")" : "") }] : [])].map(item =>
        <button key={item.id} type="button" aria-pressed={filter === item.id} disabled={isRecording} onClick={() => setFilter(item.id)} className={"rounded-full border px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring " + (filter === item.id ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:bg-muted")}>{item.label}</button>
      )}
    </div>
    <p className="text-xs text-muted-foreground">All platforms keeps each platform’s defaults when adding shortcuts. Choose one platform to change only its keys.</p>
    {keyboard.syncError && <div role="alert" className="rounded border p-3 text-sm">{keyboard.syncError} <button type="button" className="underline" onClick={() => void keyboard.reload()}>Retry sync</button></div>}
    <div className="space-y-6">
      {[...new Set(matches.map(command => command.group))].map(group => <div key={group}>
        <h3 className="border-b pb-2 text-sm font-semibold">{group}</h3>
        <div className="divide-y">
          {matches.filter(command => command.group === group).map(command => {
            const bindings = effectiveBindings(command.id, preferences, platform);
            const commandErrors = errors.filter(item => item.commandId === command.id || item.otherId === command.id);
            const suggestion = commandErrors.length ? suggestBinding(command.id, preferences, platform) : null;
            const recordingThis = recording?.id === command.id;
            return <div key={command.id} className="py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <p className="min-w-0 flex-[1_1_11rem] font-medium">{command.label}</p>
                <div className="flex min-w-0 max-w-full flex-wrap items-center justify-end gap-1.5">
                  {bindings.map((binding, index) => <span key={binding + "-" + index} className="inline-flex max-w-full items-center rounded-md border bg-muted/40">
                    <button type="button" aria-label={"Change " + binding + " for " + command.label} title="Change shortcut" className="min-h-9 min-w-0 max-w-full rounded-l-md px-2 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring" disabled={isRecording || saving} onClick={() => setRecording({ id: command.id, replace: index })}>{recordingThis && recording?.replace === index ? <span data-shortcut-recording role="status">Press hotkey…</span> : <ShortcutKeys bindings={[binding]} />}</button>
                    <button type="button" aria-label={"Remove " + binding + " from " + command.label} title="Remove shortcut" className={iconButton} disabled={saving || isRecording} onClick={() => edit(command.id, { remove: index })}><X className="size-3.5" aria-hidden="true" /></button>
                  </span>)}
                  {!bindings.length && !recordingThis && <button type="button" aria-label={"Assign shortcut to " + command.label} className="min-h-9 rounded-md border border-dashed px-3 text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring" disabled={isRecording || saving} onClick={() => setRecording({ id: command.id })}>Unassigned</button>}
                  {recordingThis && recording?.replace === undefined && <span data-shortcut-recording role="status" className="rounded-md border border-ring px-3 py-2 text-muted-foreground">Press hotkey…</span>}
                  <button type="button" className={iconButton} aria-label={"Add shortcut for " + command.label} title="Add shortcut" disabled={isRecording || saving} onClick={() => setRecording({ id: command.id })}><Plus className="size-4" aria-hidden="true" /></button>
                  <button type="button" className={iconButton} aria-label={"Restore defaults for " + command.label} title="Restore defaults" disabled={saving || isRecording} onClick={() => edit(command.id, { reset: true })}><RotateCcw className="size-4" aria-hidden="true" /></button>
                </div>
              </div>
              {commandErrors.length > 0 && <div role="alert" className="mt-2 space-y-1 text-xs text-destructive">
                {commandErrors.map((item, index) => <p key={index}>{item.platform}: {item.commandId === command.id ? item.message : "Conflicts with " + (keyboardCommands.find(other => other.id === item.commandId)?.label ?? item.commandId) + "."} {item.otherId && <button type="button" className="underline" onClick={() => edit(item.commandId === command.id ? item.otherId! : item.commandId, { bindings: [] })}>Remove conflicting assignment</button>}</p>)}
                {suggestion && <button type="button" className="underline" onClick={() => edit(command.id, { bindings: [suggestion] })}>Use available alternative {suggestion}</button>}
              </div>}
            </div>;
          })}
        </div>
      </div>)}
    </div>
    {matches.length === 0 && <p role="status" className="py-6 text-sm text-muted-foreground">No shortcuts match this search and filter.</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error} Your draft is preserved. Retry Save when ready.</p>}
    {saved && <p role="status" className="text-sm">Shortcuts saved.</p>}
    <div className="sticky bottom-0 flex flex-wrap gap-2 border-t bg-background py-3">
      <Button disabled={!draft || errors.length > 0 || saving || isRecording} onClick={async () => {
        setSaving(true); setError(null);
        try { await keyboard.save(preferences); setDraft(null); setSaved(true); }
        catch (failure) { setError(failure instanceof Error ? failure.message : "Shortcuts could not be saved."); }
        finally { setSaving(false); }
      }}>{saving ? "Saving…" : "Save shortcuts"}</Button>
      <Button variant="outline" disabled={saving} onClick={() => { setDraft(null); setRecording(null); setError(null); setSaved(false); }}>Cancel changes</Button>
      <Button variant="ghost" disabled={saving || isRecording} onClick={() => { setDraft(defaultPreferences()); setSaved(false); setError(null); }}>Reset all shortcuts</Button>
    </div>
  </section>;
}
