"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSidebar } from "@/components/ui/sidebar";
import { useRamble } from "@/components/ramble/ramble-provider";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { loadKeyboardPreferences, saveKeyboardPreferences } from "@/app/(app)/settings/keyboard-actions";
import { KeyboardDispatcher, keyboardCommands, effectiveBindings, safePreferences, type KeyboardPreferences, type Platform, type KeyboardCommand } from "@/lib/keyboard";

export interface KeyboardHandlerOptions {
  enabled?: boolean;
  scope?: RefObject<HTMLElement | null>;
  allowInEditor?: boolean;
  allowInModal?: boolean;
}
type Handler = (event?: KeyboardEvent) => void | boolean;
type Registration = { handlers: Record<string, Handler>; options: KeyboardHandlerOptions };
interface KeyboardContextValue {
  preferences: KeyboardPreferences; platform: Platform; syncError: string | null;
  bindings(id: string): string[]; openHelp(): void;
  save(preferences: KeyboardPreferences): Promise<void>; reload(): Promise<void>;
  setRecording(value: boolean): void;
  register(registration: Registration): () => void;
}
const KeyboardContext = createContext<KeyboardContextValue | null>(null);
export function useKeyboard() {
  const context = useContext(KeyboardContext);
  if (!context) throw new Error("Keyboard commands require KeyboardProvider.");
  return context;
}
// Use one registration per active view/editor. A scope disambiguates identical specialized contexts.
export function useKeyboardCommands(handlers: Record<string, Handler>, options: KeyboardHandlerOptions = {}) {
  const { register } = useKeyboard();
  const handlersRef = useRef(handlers);
  useEffect(() => { handlersRef.current = handlers; }, [handlers]);
  const ids = Object.keys(handlers).sort().join("|");
  const { enabled = true, scope, allowInEditor = false, allowInModal = false } = options;
  useEffect(() => {
    const wrappers = Object.fromEntries(ids.split("|").filter(Boolean).map(id => [id, (event?: KeyboardEvent) => handlersRef.current[id]?.(event)]));
    return register({ handlers: wrappers, options: { enabled, scope, allowInEditor, allowInModal } });
  }, [register, ids, enabled, scope, allowInEditor, allowInModal]);
}
const spoken: Record<string, string> = { Meta: "Command", Ctrl: "Control", Alt: "Alt or Option", ArrowUp: "Up arrow", ArrowDown: "Down arrow", ArrowLeft: "Left arrow", ArrowRight: "Right arrow", Escape: "Escape", Backspace: "Backspace" };
const display: Record<string, string> = { Meta: "⌘", Ctrl: "Ctrl", Alt: "⌥", Shift: "⇧", ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", Escape: "Esc", Backspace: "⌫", Space: "Space" };
export function ShortcutKeys({ bindings, className = "" }: { bindings: string[]; className?: string }) {
  return <span className={`inline-flex flex-wrap items-center justify-end gap-1 ${className}`}>
    {bindings.map((binding, index) => <span key={`${binding}-${index}`} className="inline-flex items-center gap-1" aria-label={binding.split(" then ").map(step => step.split("+").map(key => spoken[key] ?? key).join(" plus ")).join(" then ")}>
      {index > 0 && <span className="text-xs text-muted-foreground" aria-hidden>or</span>}
      {binding.split(" then ").map((step, stepIndex) => <span key={stepIndex} className="inline-flex items-center gap-0.5" aria-hidden>
        {stepIndex > 0 && <span className="px-1 text-xs text-muted-foreground">then</span>}
        {step.split("+").map((key, keyIndex) => <kbd key={keyIndex} className="min-w-5 rounded border bg-muted px-1 py-0.5 text-center font-sans text-xs leading-none shadow-xs">{display[key] ?? (key.length === 1 ? key.toUpperCase() : key)}</kbd>)}
      </span>)}
    </span>)}
  </span>;
}
export function ShortcutHint({ commandId }: { commandId: string }) {
  const { bindings } = useKeyboard();
  return <ShortcutKeys bindings={bindings(commandId)} />;
}
function isEditor(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest('input,textarea,select,[contenteditable=""],[contenteditable="true"],[role="textbox"]'));
}
const priority: Record<KeyboardCommand["context"], number> = { "quick-add": 7, editor: 6, task: 5, calendar: 4, upcoming: 4, project: 3, view: 2, global: 1 };
const subscribePlatform = () => () => {};
const detectPlatform = (): Platform => /Mac|iPhone|iPad/.test(navigator.platform) ? "mac" : /Linux/.test(navigator.platform) ? "linux" : "windows";
export function KeyboardProvider({ children, initialPreferences, initialError }: { children: React.ReactNode; initialPreferences: KeyboardPreferences; initialError?: string }) {
  const router = useRouter(); const pathname = usePathname(); const { toggleSidebar } = useSidebar(); const openRamble = useRamble();
  const [preferences, setPreferences] = useState(initialPreferences);
  const platform = useSyncExternalStore(subscribePlatform, detectPlatform, () => "windows" as Platform);
  const [syncError, setSyncError] = useState<string | null>(initialError ?? null);
  const [helpOpen, setHelpOpen] = useState(false);
  const registrations = useRef(new Set<Registration>());
  const recording = useRef(false); const composing = useRef(false); const dispatcher = useRef(new KeyboardDispatcher());
  const closeRef = useRef<HTMLButtonElement>(null);
  const focusBeforeHelp = useRef<HTMLElement | null>(null);
  const setRecording = useCallback((active: boolean) => { recording.current = active; dispatcher.current.reset(); }, []);
  const resolved = useMemo(() => safePreferences(preferences, platform), [preferences, platform]);
  const bindings = useCallback((id: string) => effectiveBindings(id, resolved.preferences, platform), [resolved.preferences, platform]);
  const register = useCallback((registration: Registration) => {
    registrations.current.add(registration); dispatcher.current.reset();
    return () => { registrations.current.delete(registration); dispatcher.current.reset(); };
  }, []);
  const openHelp = useCallback(() => {
    focusBeforeHelp.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setHelpOpen(true);
  }, []);
  const reload = useCallback(async () => {
    try {
      const loaded = await loadKeyboardPreferences();
      if (loaded.error) { setSyncError(loaded.error); return; }
      setPreferences(loaded.preferences); setSyncError(null);
    } catch { setSyncError("Shortcuts could not sync. Your current bindings are retained. Retry from Settings."); }
  }, []);
  const save = useCallback(async (draft: KeyboardPreferences) => {
    const saved = await saveKeyboardPreferences(draft);
    setPreferences(saved); setSyncError(null);
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel("todalo-keyboard-refresh"); channel.postMessage("refresh"); channel.close();
    }
  }, []);
  useEffect(() => {
    const visible = () => { if (document.visibilityState === "visible") void reload(); };
    const timer = window.setInterval(visible, 30000);
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("todalo-keyboard-refresh") : null;
    if (channel) channel.onmessage = () => void reload();
    document.addEventListener("visibilitychange", visible);
    return () => { clearInterval(timer); channel?.close(); document.removeEventListener("visibilitychange", visible); };
  }, [reload]);
  useEffect(() => {
    const globalHandlers: Record<string, Handler> = {
      "general.help": openHelp, "navigation.help": openHelp,
      "general.sidebar": toggleSidebar, "general.ramble": () => openRamble(),
      "general.capture": () => document.querySelector<HTMLButtonElement>('[data-keyboard-capture]')?.click(),
      "navigation.today": () => router.push("/today"), "navigation.upcoming": () => router.push("/upcoming"), "navigation.settings": () => router.push("/settings#keyboard-shortcuts"),
      "navigation.account": () => document.querySelector<HTMLButtonElement>('[aria-label="Account menu"]')?.click(),
      "navigation.theme": () => {
        const dark = document.documentElement.classList.toggle("dark");
        localStorage.setItem("todalo-theme", dark ? "dark" : "light");
      },
    };
    const onKey = (event: KeyboardEvent) => {
      if (recording.current || composing.current || event.isComposing || event.defaultPrevented) { dispatcher.current.reset(); return; }
      const editor = isEditor(event.target);
      const modal = Boolean(document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]'));
      const candidates: { command: KeyboardCommand; handler: Handler }[] = [];
      for (const registration of registrations.current) {
        const options = registration.options;
        if (options.enabled === false || (editor && !options.allowInEditor) || (modal && !options.allowInModal)) continue;
        if (options.scope?.current && !options.scope.current.contains(document.activeElement)) continue;
        for (const [id, handler] of Object.entries(registration.handlers)) {
          const command = keyboardCommands.find(item => item.id === id);
          if (command && command.availability === "available") candidates.push({ command, handler });
        }
      }
      if (!editor && !modal) for (const [id, handler] of Object.entries(globalHandlers)) {
        const command = keyboardCommands.find(item => item.id === id);
        if (command) candidates.push({ command, handler });
      }
      candidates.sort((a, b) => priority[b.command.context] - priority[a.command.context]);
      const context = `${pathname}:${editor}:${modal}:${candidates.map(item => item.command.id).join(",")}`;
      const result = dispatcher.current.dispatch(event, candidates.map(({ command }) => ({ id: command.id, bindings: bindings(command.id), repeat: command.repeat })), context);
      if (result.commandId) {
        const candidate = candidates.find(item => item.command.id === result.commandId);
        if (candidate?.handler(event) === false) return;
      }
      if (result.consumed) { event.preventDefault(); event.stopPropagation(); }
    };
    const reset = () => dispatcher.current.reset();
    const start = () => { composing.current = true; reset(); }; const end = () => { composing.current = false; reset(); };
    window.addEventListener("keydown", onKey); window.addEventListener("blur", reset);
    document.addEventListener("focusin", reset); document.addEventListener("compositionstart", start); document.addEventListener("compositionend", end);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("blur", reset); document.removeEventListener("focusin", reset); document.removeEventListener("compositionstart", start); document.removeEventListener("compositionend", end); };
  }, [bindings, pathname, router, openHelp, toggleSidebar, openRamble]);
  const displayedSyncError = syncError ?? (resolved.errors.length ? "Saved shortcuts conflict with updated defaults. Your previous effective bindings are retained. Resolve conflicts in Settings." : null);
  const value = useMemo(() => ({ preferences, platform, syncError: displayedSyncError, bindings, openHelp, save, reload, register, setRecording }), [preferences, platform, displayedSyncError, bindings, openHelp, save, reload, register, setRecording]);
  const available = keyboardCommands.filter(command => command.availability === "available" && bindings(command.id).length);
  return <KeyboardContext.Provider value={value}>
    {children}
    {displayedSyncError && <div role="status" className="fixed bottom-3 left-3 z-40 max-w-sm rounded border bg-background p-3 text-sm shadow">{displayedSyncError} <button className="underline" onClick={() => router.push("/settings#keyboard-shortcuts")}>Shortcut settings</button></div>}
    <Sheet open={helpOpen} onOpenChange={open => { setHelpOpen(open); if (!open) requestAnimationFrame(() => focusBeforeHelp.current?.isConnected && focusBeforeHelp.current.focus()); }}>
      <SheetContent showCloseButton={false} initialFocus={closeRef} className="gap-0 data-[side=right]:w-full sm:max-w-lg motion-reduce:transition-none">
        <SheetHeader className="shrink-0 border-b">
          <div className="flex items-center justify-between gap-4"><SheetTitle>Keyboard Shortcuts</SheetTitle><SheetClose ref={closeRef} render={<Button variant="ghost" size="icon-sm" aria-label="Close keyboard shortcuts" />}>×</SheetClose></div>
          <SheetDescription><button className="underline" onClick={() => { setHelpOpen(false); router.push("/settings#keyboard-shortcuts"); }}>Customize shortcuts in Settings</button></SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
          {[...new Set(available.map(command => command.group))].map(group => <section key={group} className="pt-5">
            <h2 className="mb-2 border-b pb-2 font-semibold">{group}</h2>
            {available.filter(command => command.group === group).map(command => <div key={command.id} className="flex items-center justify-between gap-4 py-2.5"><span className="min-w-0 flex-1">{command.label}</span><ShortcutKeys className="max-w-[55%] shrink-0" bindings={bindings(command.id)} /></div>)}
          </section>)}
        </div>
      </SheetContent>
    </Sheet>
  </KeyboardContext.Provider>;
}
