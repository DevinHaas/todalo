"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { keyboardCommands, defaultPreferences, effectiveBindings, validatePreferences, suggestBinding, bindingFromEvent, type Platform, type KeyboardPreferences } from "@/lib/keyboard";
import { useKeyboard, ShortcutKeys } from "./keyboard-provider";
import { editKeyboardBindings } from "@/lib/keyboard-edit";

export function ShortcutSettings() {
  const keyboard = useKeyboard();
  const [draft, setDraft] = useState<KeyboardPreferences | null>(null);
  const [query, setQuery] = useState("");
  const [profile, setProfile] = useState<"portable" | Platform>("portable");
  const [recording, setRecording] = useState<{ id: string; steps: string[]; replace?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const preferences = draft ?? keyboard.preferences;
  const platform = profile === "portable" ? keyboard.platform : profile;
  const errors = useMemo(() => validatePreferences(preferences), [preferences]);
  const matches = keyboardCommands.filter(command => `${command.label} ${command.group} ${command.note ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  const isRecording = Boolean(recording);
  const setProviderRecording = keyboard.setRecording;
  useEffect(() => {
    if (!isRecording) return;
    setProviderRecording(true);
    const capture = (event: KeyboardEvent) => {
      event.preventDefault(); event.stopImmediatePropagation();
      if (event.repeat || event.isComposing) return;
      const binding = bindingFromEvent(event);
      if (!binding) return;
      const portable = profile === "portable" ? binding.replace(platform === "mac" ? "Meta+" : "Ctrl+", "Primary+") : binding;
      setRecording(current => current ? { ...current, steps: [...current.steps, portable].slice(0, 3) } : current);
    };
    window.addEventListener("keydown", capture, true);
    return () => { setProviderRecording(false); window.removeEventListener("keydown", capture, true); };
  }, [isRecording, setProviderRecording, profile, platform]);
  function update(id: string, bindings: string[] | undefined) {
    setSaved(false); setError(null);
    setDraft(current => {
      return editKeyboardBindings(current ?? keyboard.preferences, id, profile, bindings === undefined ? { reset: true } : { bindings });
    });
  }
  function currentBindings(id: string) {
    return effectiveBindings(id, preferences, platform);
  }
  function finishRecording() {
    if (!recording?.steps.length) return;
    const binding = recording.steps.join(" then ");
    setDraft(current => editKeyboardBindings(current ?? keyboard.preferences, recording.id, profile, recording.replace !== undefined ? { replace: recording.replace, binding } : { add: binding }));
    setSaved(false); setError(null); setRecording(null);
  }
  return <section id="keyboard-shortcuts" className="space-y-4 border-t pt-6 font-sans">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Keyboard shortcuts</h2><Button variant="outline" onClick={keyboard.openHelp}>Keyboard Shortcuts help</Button></div>
    <p className="text-sm text-muted-foreground">Customize keys, chords or sequences. Changes apply after saving and sync with your account. Browser capture varies; known reserved combinations cannot be saved.</p>
    <div className="flex flex-wrap gap-3"><Input aria-label="Search keyboard shortcuts" placeholder="Search shortcuts…" value={query} onChange={event => setQuery(event.target.value)} className="flex-1" /><label className="flex items-center gap-2 text-sm">Binding profile<select aria-label="Binding profile" value={profile} disabled={Boolean(recording)} onChange={event => setProfile(event.target.value as typeof profile)} className="rounded border bg-background px-2 py-1"><option value="portable">All platforms (Command/Control)</option><option value="mac">macOS override</option><option value="windows">Windows override</option><option value="linux">Linux override</option></select></label></div>
    <p className="text-xs text-muted-foreground">All-platform edits apply to each platform’s current bindings, preserving its defaults when adding an alternate. Replace or remove uses the displayed binding position on each platform. Choose a platform profile to change only that platform.</p>
    {recording && <div className="space-y-2 rounded border bg-muted p-3" role="status"><p>Recording {keyboardCommands.find(command => command.id === recording.id)?.label}. Press up to three keys or chords in sequence, then finish using the button. Enter is recorded as a key.</p><ShortcutKeys bindings={recording.steps.length ? [recording.steps.join(" then ")] : []} /><div className="flex gap-2"><Button onClick={finishRecording} disabled={!recording.steps.length}>Finish recording</Button><Button variant="outline" onClick={() => setRecording(current => current && { ...current, steps: [] })}>Clear recording</Button><Button variant="ghost" onClick={() => setRecording(null)}>Cancel recording</Button></div></div>}
    {keyboard.syncError && <div role="alert" className="rounded border p-3 text-sm">{keyboard.syncError} <button className="underline" onClick={() => void keyboard.reload()}>Retry sync</button></div>}
    {[...new Set(matches.map(command => command.group))].map(group => <div key={group} className="space-y-3"><h3 className="border-b pb-2 font-medium">{group}</h3>{matches.filter(command => command.group === group).map(command => {
      const effective = effectiveBindings(command.id, preferences, platform);
      const commandErrors = errors.filter(item => item.commandId === command.id || item.otherId === command.id);
      const available = command.availability === "available";
      const suggestion = commandErrors.length ? suggestBinding(command.id, preferences, platform) : null;
      return <div key={command.id} className="space-y-2 rounded border p-3 text-sm">
        <div className="flex items-start justify-between gap-3"><div><p className="font-medium">{command.label} <span className="text-xs font-normal text-muted-foreground">{available ? (effective.length ? "" : "Disabled") : command.availability === "planned" ? `Unavailable · stage ${command.stage}` : command.availability}</span></p><p className="text-xs text-muted-foreground">Context: {command.context}. Defaults: {effectiveBindings(command.id, defaultPreferences(), platform).join(" or ") || "None"}</p>{command.note && <p className="mt-1 text-xs text-muted-foreground">{command.note}</p>}</div><ShortcutKeys className="max-w-[50%]" bindings={effective} /></div>
        {available && <div className="flex flex-wrap gap-2">
          {currentBindings(command.id).map((binding, index) => <span key={index} className="inline-flex items-center gap-1"><Button size="sm" variant="outline" disabled={Boolean(recording) || saving} onClick={() => setRecording({ id: command.id, steps: [], replace: index })}>Replace {binding}</Button><button aria-label={`Remove ${binding} from ${command.label}`} className="px-1" disabled={saving || Boolean(recording)} onClick={() => { setDraft(current => editKeyboardBindings(current ?? keyboard.preferences, command.id, profile, { remove: index })); setSaved(false); setError(null); }}>×</button></span>)}
          <Button variant="outline" size="sm" disabled={Boolean(recording) || saving} onClick={() => setRecording({ id: command.id, steps: [] })}>Add binding</Button><Button variant="ghost" size="sm" disabled={saving || Boolean(recording)} onClick={() => update(command.id, [])}>Disable</Button><Button variant="ghost" size="sm" disabled={saving || Boolean(recording)} onClick={() => update(command.id, undefined)}>Restore defaults</Button>
        </div>}
        {commandErrors.length > 0 && <div role="alert" className="space-y-1 text-destructive">{commandErrors.map((item, index) => <p key={index}>{item.platform}: {item.commandId === command.id ? item.message : `Conflicts with ${keyboardCommands.find(other => other.id === item.commandId)?.label ?? item.commandId}.`} {item.otherId && <button className="underline" onClick={() => update(item.commandId === command.id ? item.otherId! : item.commandId, [])}>Remove conflicting assignment</button>}</p>)}{suggestion && available && <button className="underline" onClick={() => update(command.id, [suggestion])}>Use available alternative {suggestion}</button>}</div>}
      </div>;
    })}</div>)}
    {matches.length === 0 && <p>No shortcuts match your search.</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error} Your draft is preserved. Retry Save when ready.</p>}
    {saved && <p role="status" className="text-sm">Shortcuts saved.</p>}
    <div className="sticky bottom-0 flex flex-wrap gap-2 border-t bg-background py-3"><Button disabled={!draft || errors.length > 0 || saving || Boolean(recording)} onClick={async () => { setSaving(true); setError(null); try { await keyboard.save(preferences); setDraft(null); setSaved(true); } catch (failure) { setError(failure instanceof Error ? failure.message : "Shortcuts could not be saved."); } finally { setSaving(false); } }}>{saving ? "Saving…" : "Save shortcuts"}</Button><Button variant="outline" disabled={saving} onClick={() => { setDraft(null); setRecording(null); setError(null); }}>Cancel changes</Button><Button variant="ghost" disabled={saving || Boolean(recording)} onClick={() => { setDraft(defaultPreferences()); setSaved(false); }}>Reset all to Todoist defaults</Button></div>
  </section>;
}
