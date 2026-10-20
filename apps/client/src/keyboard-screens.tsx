import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { defaultPreferences, effectiveBindings, KeyboardDispatcher, safePreferences, type KeyboardPreferences } from "@todalo/ramble/keyboard";
import { reads, shortcutReads, shortcuts } from "./runtime";
import { useBulkWrites } from "./bulk-screens";
import { useOrganizationMutations } from "./organization-screens";
import { parentCandidates } from "./organization";
import type { TaskDto } from "./tasks";
import { adjacentRow, detectPlatform, dispatchCommands, isEditable, keyboardKeys, modalOpen, type ClientCommandId } from "./keyboard";
import { ShortcutHelp, ShortcutSettings, TaskMenu, type TaskMenuAction } from "./keyboard-views";
import { collapsedTasks } from "./views";
import { copyTaskLink } from "./links";
import { theme } from "./theme";

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

// Composer and editor keys press the buttons a tap uses in the form holding focus.
const composerForm = () => document.activeElement?.closest<HTMLFormElement>("form.composer-form") ?? null;
const inComposerTitle = () => Boolean(document.activeElement?.closest(".quick-add-title")) && composerForm();
const editorForm = () => document.activeElement?.closest<HTMLFormElement>(".task-editor form") ?? null;
function press(scope: ParentNode | null, selector: string) {
  const control = scope?.querySelector<HTMLButtonElement>(selector);
  if (!control || control.disabled) return false;
  control.click();
}
/** Opens Additional actions (unless open) and focuses one of its fields. */
function metadataField(field: "priority" | "deadline") {
  const form = inComposerTitle();
  if (!form) return false;
  const toggle = form.querySelector<HTMLElement>('[aria-label="Additional actions"]');
  if (toggle?.getAttribute("aria-expanded") !== "true") toggle?.click();
  requestAnimationFrame(() => form.querySelector<HTMLElement>(`[data-metadata-field="${field}"]`)?.focus());
}
/** Add task in the focused row's section (else the page's first list), at the bottom or switched to the top. */
function addTask(edge: "top" | "bottom") {
  const scope = activeRow()?.closest("section") ?? document.querySelector("main");
  const trigger = scope?.querySelector<HTMLElement>("button.composer") ?? document.querySelector<HTMLElement>("main button.composer");
  if (!trigger) return false;
  const section = trigger.closest("section") ?? document;
  trigger.click();
  if (edge === "top") requestAnimationFrame(() => section.querySelector<HTMLElement>('form.composer-form [aria-label="Position: bottom"]')?.click());
}

/** Resolves on the next frames once `find` returns an element (null after `ms`). */
function waitFor<T>(find: () => T | null | undefined, ms = 3000): Promise<T | null> {
  const end = Date.now() + ms;
  return new Promise(resolve => { const tick = () => { const found = find(); if (found) resolve(found); else if (Date.now() > end) resolve(null); else requestAnimationFrame(tick); }; tick(); });
}
/** Picks an option the way a tap does: React sees a native change event. */
function choose(select: HTMLSelectElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
}
const dialogOpen = () => Boolean(document.querySelector('[role="dialog"]'));
/** Runs `then` once no dialog is open (the user saved or cancelled). ponytail: 200 ms poll, capped at 10 min. */
function afterDialogs(then: () => void) {
  const end = Date.now() + 600_000;
  const id = setInterval(() => { if (dialogOpen() && Date.now() < end) return; clearInterval(id); then(); }, 200);
}
/** Focuses the row again, or the row that took its place when it left the list. */
function refocus(row: HTMLElement, index: number) {
  if (document.activeElement && document.activeElement !== document.body) return;
  const rows = visibleRows();
  (row.isConnected ? row : rows[Math.min(index, rows.length - 1)])?.querySelector<HTMLElement>(TITLE)?.focus();
}
const bulkButton = (name: string) => document.querySelector<HTMLButtonElement>(`main [role="toolbar"] [data-bulk="${name}"]:not(:disabled)`);
/** Legacy targets: the selected tasks, else the focused row. */
const targetIds = () => {
  const selected = [...document.querySelectorAll<HTMLElement>("main [data-task-id][data-selected]")];
  return (selected.length ? selected : [activeRow()].filter((row): row is HTMLElement => Boolean(row))).map(row => row.dataset.taskId!);
};
/**
 * Pickers without a row control (date, priority, labels, deadline): the
 * selection toolbar's button when tasks are selected, else the focused row's
 * task opens with its editor (as a tap on the title does) on that field.
 */
function picker(toolbar: string | null, field: string) {
  const button = toolbar ? bulkButton(toolbar) : null;
  if (button) return void button.click();
  const title = activeRow()?.querySelector<HTMLElement>(TITLE);
  if (!title) return false;
  title.click();
  void waitFor(() => document.querySelector<HTMLElement>(`.task-editor form [data-field="${field}"]`)).then(target =>
    (target?.matches("fieldset") ? target.querySelector<HTMLElement>("input") ?? target : target)?.focus());
}
/** Move: the toolbar's Move (its dialog takes focus); with nothing selected, the focused row is selected first (Select, its checkbox) and the selection ends after the dialog. */
function moveDialog() {
  const button = bulkButton("move");
  if (button) return void button.click();
  const row = activeRow();
  const start = document.querySelector<HTMLElement>("[data-selection-start]");
  if (!row || (!start && !row.querySelector(".select-box"))) return false;
  const index = visibleRows().indexOf(row);
  start?.click();
  void (async () => {
    (await waitFor(() => row.querySelector<HTMLInputElement>(".select-box")))?.click();
    const move = await waitFor(() => bulkButton("move"));
    if (!move) return;
    move.click();
    afterDialogs(() => { if (start) document.querySelector<HTMLElement>("[data-selection-stop]")?.click(); requestAnimationFrame(() => refocus(row, index)); });
  })();
}
/** Previous/next task while editing: the task list the editor was opened from (row title taps and Enter record it). */
let openedFrom: string[] = [];
const recordList = (event: Event) => {
  const title = (event.target as Element | null)?.closest?.(`main [data-task-id] :is(${TITLE})`);
  if (title) openedFrom = visibleRows().map(row => row.dataset.taskId!);
};
/** The task before (-1) or after (1) `id` in that list, if any. */
export const taskNeighbour = (id: string, step: -1 | 1): string | undefined => {
  const index = openedFrom.indexOf(id);
  return index < 0 ? undefined : openedFrom[index + step];
};

/**
 * Ticket 19: the legacy global key handler. Keys typed into fields, while a
 * dialog or menu is open, during IME composition, or already handled (dnd-kit)
 * never run commands; macOS app-menu keys are reserved in the shared registry.
 */
export function KeyboardCommands({ userId, onCapture, onSidebar, onFind }: { userId: string; onCapture: () => void; onSidebar: () => void; onFind: (sectionsOnly?: boolean) => void }) {
  const navigate = useNavigate();
  const cache = useQueryClient();
  const { effective, syncError } = useShortcuts(userId);
  const [help, setHelp] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const handlers = useRef<Partial<Record<ClientCommandId, () => void | boolean>>>({});
  // Collapsed sub-tasks are page state (legacy provider per page).
  const { pathname } = useLocation();
  useEffect(() => collapsedTasks.set(new Set()), [pathname]);
  useEffect(() => { if (!status) return; const id = setTimeout(() => setStatus(null), 4000); return () => clearTimeout(id); }, [status]);
  // The sidebar's Help & resources opens the same sheet as `?`.
  useEffect(() => {
    const open = () => { opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setHelp(true); };
    window.addEventListener("todalo:help", open);
    return () => window.removeEventListener("todalo:help", open);
  }, []);
  const opener = useRef<HTMLElement | null>(null);
  const dispatcher = useRef(new KeyboardDispatcher());
  // Immediate row writes use the mutations behind the toolbar and the task page's Nest/Unnest buttons.
  const bulk = useBulkWrites(userId);
  const metadata = useMutation(bulk.metadata);
  const clearDates = useMutation(bulk.clearDates);
  const organize = useMutation(useOrganizationMutations(userId).organize);
  const latest = useRef({ navigate, onCapture, onSidebar, onFind, cache, metadata, clearDates, organize });
  latest.current = { navigate, onCapture, onSidebar, onFind, cache, metadata, clearDates, organize };
  useEffect(() => { if (!notice) return; const id = setTimeout(() => setNotice(null), 6000); return () => clearTimeout(id); }, [notice]);

  useEffect(() => {
    const go = (path: string) => () => void latest.current.navigate(path);
    const openHelp = () => { opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setHelp(true); };
    const all = async () => (await latest.current.cache.fetchQuery(reads.today(userId))).tasks;
    const write = (action: () => Promise<unknown>) => { setNotice(null); action().catch((reason: unknown) => setNotice(reason instanceof Error ? reason.message : "Your changes could not be saved. Try again.")); };
    /** Legacy metadata keys: the selection, else the focused task; false (key passes on) with neither. */
    const rowWrite = (change: (tasks: TaskDto[]) => Promise<unknown>) => {
      const ids = targetIds();
      if (!ids.length) return false;
      write(async () => { const tasks = await all(); await change(ids.map(id => tasks.find(task => task.id === id)).filter((task): task is TaskDto => Boolean(task))); });
    };
    const sortable = () => (document.querySelector<HTMLSelectElement>('main [aria-label="Project sort"]')?.value ?? "manual") === "manual";
    const focusedTask = async (row: HTMLElement) => { const tasks = await all(); return { tasks, task: tasks.find(task => task.id === row.dataset.taskId) }; };
    const sort = (value: string, yieldToRow = false) => {
      const select = document.querySelector<HTMLSelectElement>('main [aria-label="Project sort"]');
      if (!select || (yieldToRow && activeRow())) return false;
      choose(select, value);
    };
    const week = (scope: string, action: string) => press(document.querySelector(`main ${scope}`), `[data-view-nav="${action}"]`);
    /** The editor's Previous/Next (save, then the adjacent task of the list it was opened from). */
    const editAdjacent = (step: number) => press(editorForm(), `[data-navigate="${step}"]`);
    /** Hiding a focused sub-task moves focus to its parent row. */
    const keepFocus = (row: HTMLElement | null) => requestAnimationFrame(() => {
      if (row?.hidden && row.dataset.parentId) document.querySelector<HTMLElement>(`main [data-task-id="${CSS.escape(row.dataset.parentId)}"] :is(${TITLE})`)?.focus();
    });
    handlers.current = {
      "general.capture": () => latest.current.onCapture(), "general.ramble": go("/ramble"), "general.sidebar": () => latest.current.onSidebar(),
      "general.help": openHelp, "navigation.help": openHelp,
      "general.search": () => latest.current.onFind(), "general.quick-find": () => latest.current.onFind(),
      "navigation.inbox": go("/inbox"), "navigation.sections": () => latest.current.onFind(true), "navigation.today": go("/today"), "navigation.upcoming": go("/upcoming"), "navigation.projects": go("/projects"),
      "navigation.labels": go("/labels"), "navigation.filters": go("/filters"), "navigation.settings": go("/account#keyboard-shortcuts"), "navigation.account": go("/account"), "navigation.theme": () => theme.toggle(),
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
      "task.add-bottom": () => addTask("bottom"), "task.add-top": () => addTask("top"),
      // Enter in a composer title: Add task (the next draft goes below the task just added).
      "editor.submit-below": () => { const form = inComposerTitle(); return form ? press(form, 'button[type="submit"]') : false; },
      "editor.save-above": () => {
        const editor = editorForm();
        if (editor) return press(editor, '[data-insert="above"]');
        const form = composerForm();
        if (!form || form.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled) return false;
        form.dataset.direction = "above";
        return press(form, 'button[type="submit"]');
      },
      "editor.save-below": () => press(editorForm(), '[data-insert="below"]'),
      "editor.save": () => press(editorForm(), 'button[type="submit"]'),
      "quick-add.description": () => { const form = inComposerTitle(); const field = form && form.querySelector<HTMLElement>('[aria-label="Description"]'); if (!field) return false; field.focus(); },
      "quick-add.actions": () => metadataField("priority"),
      "quick-add.deadline": () => metadataField("deadline"),
      "task.date": () => picker(null, "date"),
      "task.clear-date": () => rowWrite(tasks => latest.current.clearDates.mutateAsync({ tasks })),
      "task.priority-1": () => rowWrite(tasks => latest.current.metadata.mutateAsync({ tasks, change: { priority: 1 } })),
      "task.priority-2": () => rowWrite(tasks => latest.current.metadata.mutateAsync({ tasks, change: { priority: 2 } })),
      "task.priority-3": () => rowWrite(tasks => latest.current.metadata.mutateAsync({ tasks, change: { priority: 3 } })),
      "task.priority-4": () => rowWrite(tasks => latest.current.metadata.mutateAsync({ tasks, change: { priority: 4 } })),
      "task.priority": () => picker("priority", "priority"),
      "task.labels": () => picker("labels", "labels"),
      "task.deadline": () => picker("deadline", "deadline"),
      "task.clear-deadline": () => rowWrite(tasks => latest.current.metadata.mutateAsync({ tasks, change: { deadline: null } })),
      "task.move": moveDialog,
      // Legacy nest: under the row above (or that row's parent), only in Manual sort.
      "task.nest": () => {
        const row = activeRow();
        if (!row) return false;
        if (!sortable()) return void setNotice("Switch Sort to Manual to nest tasks.");
        const above = visibleRows()[visibleRows().indexOf(row) - 1];
        write(async () => {
          const { tasks, task } = await focusedTask(row);
          const previous = tasks.find(item => item.id === above?.dataset.taskId);
          const parent = previous?.parentId ? tasks.find(item => item.id === previous.parentId) : previous;
          if (!task || !parent || !parentCandidates(task, tasks).includes(parent)) throw new Error("Choose a task below the task you want to nest under.");
          await latest.current.organize.mutateAsync({ task, change: { parentId: parent.id } });
        });
      },
      "task.unnest": () => {
        const row = activeRow();
        if (!row) return false;
        if (!sortable()) return void setNotice("Switch Sort to Manual to nest tasks.");
        write(async () => { const { task } = await focusedTask(row); if (task?.parentId) await latest.current.organize.mutateAsync({ task, change: { parentId: null } }); });
      },
      "editor.previous": () => editAdjacent(-1), "editor.next": () => editAdjacent(1),
      "project.section": () => press(document.querySelector("main"), '[data-project-action="section"]'),
      "project.menu": () => press(document.querySelector("main"), '[data-project-action="menu"]'),
      // d: a focused row's deadline wins; focus the page (Escape) to sort.
      "project.sort-date": () => sort("date", true), "project.sort-name": () => sort("name"), "project.sort-priority": () => sort("priority"),
      // Next layout (the toolbar arrow); focus returns to the list when the focused element left with the old layout.
      "view.layout": () => {
        const was = document.activeElement;
        if (press(document, '[aria-label="Next layout"]') === false) return false;
        requestAnimationFrame(() => { if (was instanceof HTMLElement && !was.isConnected) (visibleRows()[0]?.querySelector<HTMLElement>(TITLE) ?? document.querySelector<HTMLElement>("main"))?.focus(); });
      },
      // Legacy task menu, copy link, reveal and sub-task folding (no row control in legacy either).
      "task.menu": () => { const row = activeRow(); if (!row) return false; setMenu(row); },
      // The clipboard write starts inside the key press (WebKit needs the gesture).
      "task.copy-url": () => {
        const row = activeRow();
        if (!row) return false;
        setNotice(null);
        copyTaskLink(row.dataset.taskId!).then(() => setStatus("Task link copied."), (reason: unknown) => setNotice(reason instanceof Error ? reason.message : "Could not copy task link"));
      },
      // Shift+G: the task's project (else the Inbox), the row focused there.
      "task.reveal": () => {
        const row = activeRow();
        if (!row) return false;
        write(async () => {
          const { task } = await focusedTask(row);
          if (!task) return;
          const path = task.projectId ? `/projects/${encodeURIComponent(task.projectId)}` : "/inbox";
          const moving = location.pathname !== path;
          await latest.current.navigate(`${path}#task-${task.id}`);
          // The old page's copy of the row stays mounted until the new route renders.
          const title = await waitFor(() => !(moving && row.isConnected) ? document.querySelector<HTMLElement>(`main [data-task-id="${CSS.escape(task.id)}"]:not([hidden]) :is(${TITLE})`) : null);
          title?.scrollIntoView?.({ block: "center" });
          title?.focus();
        });
      },
      "task.toggle-children": () => { const row = activeRow(); if (!row) return false; collapsedTasks.toggle(row.dataset.taskId!); },
      // Every parent's sub-tasks and a project's sections; a project only in Manual sort (legacy nestedAllowed).
      "view.toggle-nested": () => {
        if (!sortable()) return false;
        const row = activeRow();
        const parents = [...document.querySelectorAll<HTMLElement>("main [data-parent-id]")].map(child => child.dataset.parentId!);
        collapsedTasks.set(collapsedTasks.get().size ? new Set() : new Set(parents));
        window.dispatchEvent(new Event("todalo:toggle-sections"));
        keepFocus(row);
      },
      "upcoming.today": () => week(".upcoming", "today"), "upcoming.next-week": () => week(".upcoming", "next-week"), "upcoming.previous-week": () => week(".upcoming", "previous-week"),
      "calendar.today": () => week(".calendar", "today"), "calendar.next-week": () => week(".calendar", "next-week"), "calendar.previous-week": () => week(".calendar", "previous-week"),
    };
    const commands = dispatchCommands(handlers.current, id => effectiveBindings(id, effective, platform));
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) { dispatcher.current.reset(); return; }
      const result = dispatcher.current.dispatch(event, commands, location.pathname, Date.now(), { typing: isEditable(event.target), modal: modalOpen(), composing: event.isComposing });
      if (result.consumed) { event.preventDefault(); event.stopPropagation(); }
    };
    const reset = () => dispatcher.current.reset();
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", reset);
    document.addEventListener("focusin", reset);
    document.addEventListener("click", recordList, true);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("blur", reset); document.removeEventListener("focusin", reset); document.removeEventListener("click", recordList, true); };
  }, [effective, userId]);

  const close = () => { setHelp(false); requestAnimationFrame(() => { if (opener.current?.isConnected) opener.current.focus(); }); };
  const menuCommands: Record<TaskMenuAction, ClientCommandId> = { edit: "task.edit", date: "task.date", "clear-date": "task.clear-date", complete: "task.complete", delete: "task.delete" };
  /** Closes the menu on its row, then runs the row command (its focused-row target). */
  const closeMenu = (action?: TaskMenuAction) => {
    const row = menu;
    setMenu(null);
    requestAnimationFrame(() => {
      if (!row?.isConnected) return;
      row.querySelector<HTMLElement>(TITLE)?.focus();
      // Legacy cleared only the menu's task, never the selection.
      if (action === "clear-date") return void cache.fetchQuery(reads.today(userId))
        .then(({ tasks }) => { const task = tasks.find(item => item.id === row.dataset.taskId); return task && clearDates.mutateAsync({ tasks: [task] }); })
        .catch((reason: unknown) => setNotice(reason instanceof Error ? reason.message : "Your changes could not be saved. Try again."));
      if (action) handlers.current[menuCommands[action]]?.();
    });
  };
  return <>
    {notice && <p role="alert" className="keyboard-notice">{notice}</p>}
    {status && <p role="status" className="keyboard-notice">{status}</p>}
    {syncError && <div role="status" className="shortcut-sync">{syncError} <button type="button" className="text-action" onClick={() => navigate("/account#keyboard-shortcuts")}>Shortcut settings</button></div>}
    {menu && <TaskMenu title={menu.querySelector(TITLE)?.textContent ?? ""} onChoose={closeMenu} onClose={() => closeMenu()} />}
    {help && <ShortcutHelp bindings={id => effectiveBindings(id, effective, platform)} onClose={close}
      onCustomize={() => { setHelp(false); navigate("/account#keyboard-shortcuts"); }} />}
  </>;
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
