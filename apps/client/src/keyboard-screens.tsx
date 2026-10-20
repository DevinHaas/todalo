import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { defaultPreferences, effectiveBindings, KeyboardDispatcher, safePreferences, type KeyboardPreferences } from "@todalo/ramble/keyboard";
import { shortcutReads, shortcuts } from "./runtime";
import { adjacentRow, detectPlatform, dispatchCommands, isEditable, keyboardKeys, modalOpen, type ClientCommandId } from "./keyboard";
import { ShortcutHelp, ShortcutSettings } from "./keyboard-views";

const platform = detectPlatform();
const TITLE = ".task-title, .board-card-title";

/** The account's shortcuts with conflicting new defaults suppressed (legacy safePreferences). */
function useShortcuts(userId: string) {
  const query = useQuery(shortcutReads.shortcuts(userId));
  const resolved = useMemo(() => safePreferences(query.data?.preferences ?? defaultPreferences(), platform), [query.data]);
  const syncError = query.error ? "Shortcuts could not sync. Your current shortcuts still work."
    : query.data?.error ?? (resolved.errors.length ? "Saved shortcuts conflict with updated defaults. Your previous shortcuts are kept; resolve the conflicts below." : null);
  return { query, preferences: query.data?.preferences ?? defaultPreferences(), effective: resolved.preferences, syncError };
}

// Task rows are found in the page (legacy data-task-id), so every list view
// (Today, Upcoming, projects, labels, filters, search, board) shares one handler.
const visibleRows = () => [...document.querySelectorAll<HTMLElement>("main [data-task-id]")].filter(row => row.querySelector(TITLE) && row.getClientRects().length);
const activeRow = () => document.activeElement?.closest<HTMLElement>("main [data-task-id]") ?? null;
function moveRow(step: number) {
  const row = adjacentRow(visibleRows(), activeRow(), step);
  if (!row) return false;
  row.querySelector<HTMLElement>(TITLE)!.focus();
  row.scrollIntoView?.({ block: "nearest" });
}
/** Clicks the focused row's own control, so keys and taps share one write path. */
function clickInRow(selector: string) {
  const control = activeRow()?.querySelector<HTMLElement>(selector);
  if (!control) return false;
  control.click();
}
/** Complete/delete: when the row leaves the list, focus moves to the row that took its place (legacy remove()). */
function clickAndRefocus(selector: string) {
  const row = activeRow();
  const index = row ? visibleRows().indexOf(row) : -1;
  if (clickInRow(selector) === false) return false;
  const started = Date.now();
  const check = () => {
    if (row!.isConnected && Date.now() - started < 3000) return void setTimeout(check, 100);
    if (row!.isConnected || document.activeElement !== document.body) return;
    const rows = visibleRows();
    rows[Math.min(index, rows.length - 1)]?.querySelector<HTMLElement>(TITLE)?.focus();
  };
  setTimeout(check, 100);
}

/**
 * Ticket 19: the legacy global key handler. Keys typed into fields, while a
 * dialog or menu is open, during IME composition, or already handled (dnd-kit)
 * never run commands; macOS app-menu keys are reserved in the shared registry.
 */
export function KeyboardCommands({ userId, onCapture, onSidebar, onFind }: { userId: string; onCapture: () => void; onSidebar: () => void; onFind: () => void }) {
  const navigate = useNavigate();
  const { effective } = useShortcuts(userId);
  const [help, setHelp] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const dispatcher = useRef(new KeyboardDispatcher());
  const latest = useRef({ navigate, onCapture, onSidebar, onFind });
  latest.current = { navigate, onCapture, onSidebar, onFind };

  useEffect(() => {
    const go = (path: string) => () => void latest.current.navigate(path);
    const openHelp = () => { opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setHelp(true); };
    const handlers: Partial<Record<ClientCommandId, () => void | boolean>> = {
      "general.capture": () => latest.current.onCapture(), "general.ramble": go("/ramble"), "general.sidebar": () => latest.current.onSidebar(),
      "general.help": openHelp, "navigation.help": openHelp,
      "general.search": () => latest.current.onFind(), "general.quick-find": () => latest.current.onFind(),
      "navigation.today": go("/today"), "navigation.upcoming": go("/upcoming"), "navigation.projects": go("/projects"),
      "navigation.labels": go("/labels"), "navigation.filters": go("/filters"), "navigation.settings": go("/account#keyboard-shortcuts"), "navigation.account": go("/account"),
      "task.previous": () => moveRow(-1), "task.next": () => moveRow(1), "view.first": () => moveRow(-Infinity), "view.last": () => moveRow(Infinity),
      // Enter on the title opens it; Enter on the row's buttons keeps their own action.
      "task.details": () => { const title = activeRow()?.querySelector<HTMLElement>(TITLE); if (!title || document.activeElement !== title) return false; title.click(); },
      "task.edit": () => clickInRow(TITLE),
      "task.complete": () => clickAndRefocus('button[role="checkbox"]'),
      "task.delete": () => clickAndRefocus(".row-delete"),
      // Starts selection mode (the touch Select button) when needed, then toggles the row.
      "task.select": () => {
        const row = activeRow();
        if (!row) return false;
        const box = row.querySelector<HTMLElement>(".select-box");
        if (box) return void box.click();
        const start = document.querySelector<HTMLElement>("[data-selection-start]");
        if (!start) return false;
        start.click();
        requestAnimationFrame(() => row.querySelector<HTMLElement>(".select-box")?.click());
      },
      "task.toolbar": () => { const button = document.querySelector<HTMLElement>('[role="toolbar"] button'); if (!button) return false; button.focus(); },
    };
    const commands = dispatchCommands(handlers, id => effectiveBindings(id, effective, platform));
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) { dispatcher.current.reset(); return; }
      const result = dispatcher.current.dispatch(event, commands, location.pathname, Date.now(), { typing: isEditable(event.target), modal: modalOpen(), composing: event.isComposing });
      if (result.consumed) { event.preventDefault(); event.stopPropagation(); }
    };
    const reset = () => dispatcher.current.reset();
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", reset);
    document.addEventListener("focusin", reset);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("blur", reset); document.removeEventListener("focusin", reset); };
  }, [effective]);

  if (!help) return null;
  const close = () => { setHelp(false); requestAnimationFrame(() => { if (opener.current?.isConnected) opener.current.focus(); }); };
  return <ShortcutHelp bindings={id => effectiveBindings(id, effective, platform)} onClose={close}
    onCustomize={() => { setHelp(false); navigate("/account#keyboard-shortcuts"); }} />;
}

/** Account › Keyboard shortcuts; a save replaces the account document and refreshes every open screen. */
export function ShortcutSettingsScreen({ userId }: { userId: string }) {
  const cache = useQueryClient();
  const { query, preferences, effective, syncError } = useShortcuts(userId);
  const [help, setHelp] = useState(false);
  useEffect(() => { if (location.hash === "#keyboard-shortcuts") document.getElementById("keyboard-shortcuts")?.scrollIntoView(); }, []);
  if (query.status === "pending") return <p className="state" role="status">Loading shortcuts…</p>;
  return <>
    <ShortcutSettings preferences={preferences} platform={platform} syncError={syncError} onRetry={() => void query.refetch()} onHelp={() => setHelp(true)}
      onSave={async (draft: KeyboardPreferences) => {
        const saved = await shortcuts.save(draft);
        cache.setQueryData(keyboardKeys.shortcuts(userId), { preferences: saved });
      }} />
    {help && <ShortcutHelp bindings={id => effectiveBindings(id, effective, platform)} onClose={() => setHelp(false)} onCustomize={() => setHelp(false)} />}
  </>;
}
