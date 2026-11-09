import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useOpenSettings } from "./settings-nav";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { defaultPreferences, effectiveBindings, KeyboardDispatcher, safePreferences, type KeyboardPreferences } from "@todalo/ramble/keyboard";
import { coach, coachReads, reads, ritualReads, shortcutReads, shortcuts } from "./runtime";
import { coachMutations, coachProviderInfo, nextCoachProvider, usableCoachProviders } from "./coach";
import { toggleCoachSidebar } from "./coach-chat-screens";
import { focusCoachBar } from "./coach-bar";
import { openPlanning } from "./planning-screens";
import { useBulkWrites } from "./bulk-screens";
import { useOrganizationMutations } from "./organization-screens";
import { parentCandidates } from "./organization";
import type { TaskDto } from "./tasks";
import { goalKeys, type GoalsDto } from "./goals";
import { ritualKeys, type RitualsDto } from "./rituals";
import { openRitual } from "./ritual-screens";
import { adjacentRow, detectPlatform, dispatchCommands, isEditable, keyboardKeys, modalOpen, type ClientCommandId } from "./keyboard";
import { ShortcutHelp, ShortcutSettings, TaskMenu, type TaskMenuAction } from "./keyboard-views";
import { collapsedTasks } from "./views";
import { MAX_SUBTASK_DEPTH } from "../../../packages/db/src/task-parent-validation";
import { copyTaskLink } from "./links";
import { inlineError, toasts } from "./toasts";
import { connectCoachErrors, reportCoachError } from "./coach-errors";
import { useTaskWrites } from "./task-writes";
import { isTimed, unscheduledDetails } from "./schedule";
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

/** One command's effective bindings for this user and platform (e.g. the account menu's Settings shortcut). */
export function useCommandBindings(userId: string, id: string) {
  return effectiveBindings(id, useShortcuts(userId).effective, platform);
}

// Task rows are found in the page (legacy data-task-id), so every list view
// (Today, Upcoming, projects, labels, filters, search, board) shares one handler.
const ROWS = "main [data-task-id], main button.composer";
const visibleTasks = () => [...document.querySelectorAll<HTMLElement>("main [data-task-id]")].filter(row => row.querySelector(TITLE) && row.getClientRects().length);
const activeRow = () => document.activeElement?.closest<HTMLElement>("main [data-task-id]") ?? null;
// j/k also land on each list's Add task row (legacy tab order), where Enter opens the composer.
const navigable = () => [...document.querySelectorAll<HTMLElement>(ROWS)].filter(row => row.getClientRects().length && (row.matches("button") || row.querySelector(TITLE)));
function moveRow(step: number) {
  const row = adjacentRow(navigable(), document.activeElement?.closest<HTMLElement>(ROWS) ?? null, step);
  if (!row) return false;
  (row.matches("button") ? row : row.querySelector<HTMLElement>(TITLE)!).focus();
  row.scrollIntoView?.({ block: "nearest" });
}
/**
 * The task sheet owns j/k, e and Enter while focus is in it (not in a field,
 * not in one of its popovers): they walk its sub-task rows, complete the
 * focused sub-task (else the task itself) and open the focused sub-task.
 */
const SUBTASK = ".task-sheet .sheet-subtask-title";
const inSheet = () => Boolean(document.activeElement?.closest(".task-sheet")) && !document.querySelector(".task-sheet .popover");
function sheetRow(step: number) {
  const rows = [...document.querySelectorAll<HTMLElement>(SUBTASK)].filter(row => row.getClientRects().length);
  const row = adjacentRow(rows, document.activeElement?.closest<HTMLElement>(SUBTASK) ?? null, step);
  if (!row) return false;
  row.focus();
  row.scrollIntoView?.({ block: "nearest" });
}
const sheetComplete = () => {
  const control = document.activeElement?.closest(".sheet-subtask")?.querySelector<HTMLElement>('button[role="checkbox"]')
    ?? document.querySelector<HTMLElement>('.task-sheet .sheet-title-row button[role="checkbox"]');
  if (!control) return false;
  control.click();
};
const sheetOpen = () => { const title = document.activeElement?.closest<HTMLElement>(SUBTASK); if (!title) return false; title.click(); };
/** A list key: the sheet's version while it has focus, nothing behind another dialog, else the list's. */
const listOrSheet = (sheet: () => void | boolean, list: () => void | boolean) => () => inSheet() ? sheet() : modalOpen() ? false : list();

/** Clicks the focused row's own control, so keys and taps share one write path. */
function clickInRow(selector: string) {
  const control = activeRow()?.querySelector<HTMLElement>(selector);
  if (!control) return false;
  control.click();
}
/** Complete/delete: when the row leaves the list, focus moves to the row that took its place (legacy remove()). */
function clickAndRefocus(selector: string) {
  const row = activeRow();
  const index = row ? visibleTasks().indexOf(row) : -1;
  if (clickInRow(selector) === false) return false;
  const started = Date.now();
  const check = () => {
    if (row!.isConnected && Date.now() - started < 3000) return void setTimeout(check, 100);
    if (row!.isConnected || document.activeElement !== document.body) return;
    const rows = visibleTasks();
    rows[Math.min(index, rows.length - 1)]?.querySelector<HTMLElement>(TITLE)?.focus();
  };
  setTimeout(check, 100);
}

// Composer and editor keys press the buttons a tap uses in the form holding focus.
const composerForm = () => document.activeElement?.closest<HTMLFormElement>("form.composer-form") ?? null;
const inComposerTitle = () => Boolean(document.activeElement?.closest(".quick-add-title")) && composerForm();
const editorForm = () => document.activeElement?.closest<HTMLElement>(".task-editor :is(form, .sheet-form)") ?? null;
/** Ticket 21: the recommendation in the focused season goal, else the first on the page. */
const recommendation = () => document.activeElement?.closest("[data-season-goal]")?.querySelector("[data-coach-recommendation]")
  ?? document.querySelector("main [data-coach-recommendation]");

function press(scope: ParentNode | null, selector: string) {
  const control = scope?.querySelector<HTMLButtonElement>(selector);
  if (!control || control.disabled) return false;
  control.click();
}
/**
 * Goals ticket 17c: a control inside a Settings › Coach provider card; a
 * closed card is opened first (its Configure button), then the control is pressed.
 */
function coachCard(kind: string, selector: string) {
  const card = document.querySelector(`[data-coach-settings] [data-coach-card="${kind}"]`);
  if (!card) return false;
  if (press(card, selector) !== false) return;
  const configure = card.querySelector<HTMLButtonElement>('[data-coach-configure][aria-expanded="false"]');
  if (!configure) return false;
  configure.click();
  requestAnimationFrame(() => void press(card, selector));
}
/** Opens the composer's Priority or Deadline popover (its button carries the field name). */
function metadataField(field: "priority" | "deadline") {
  const trigger = inComposerTitle() && composerForm()?.querySelector<HTMLElement>(`[data-metadata-field="${field}"]`);
  if (!trigger) return false;
  trigger.click();
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
  const rows = visibleTasks();
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
  void waitFor(() => document.querySelector<HTMLElement>(`.task-editor :is(form, .sheet-form) [data-field="${field}"]`)).then(target =>
    (target?.matches("fieldset") ? target.querySelector<HTMLElement>("input") ?? target : target)?.focus());
}
/** Move: the toolbar's Move (its dialog takes focus); with nothing selected, the focused row is selected first (Select, its checkbox) and the selection ends after the dialog. */
function moveDialog() {
  const button = bulkButton("move");
  if (button) return void button.click();
  const row = activeRow();
  const start = document.querySelector<HTMLElement>("[data-selection-start]");
  if (!row || (!start && !row.querySelector(".select-box"))) return false;
  const index = visibleTasks().indexOf(row);
  start?.click();
  void (async () => {
    (await waitFor(() => row.querySelector<HTMLInputElement>(".select-box")))?.click();
    const move = await waitFor(() => bulkButton("move"));
    if (!move) return;
    move.click();
    afterDialogs(() => { if (start) document.querySelector<HTMLElement>("[data-selection-stop]")?.click(); requestAnimationFrame(() => refocus(row, index)); });
  })();
}
/** Previous/next task while editing: the task before (-1) or after (1) `id` among the page's visible rows (legacy editor over its list). */
export const taskNeighbour = (id: string, step: -1 | 1): string | undefined => {
  const rows = visibleTasks();
  const index = rows.findIndex(row => row.dataset.taskId === id);
  return index < 0 ? undefined : rows[index + step]?.dataset.taskId;
};

/**
 * Ticket 19: the legacy global key handler. Keys typed into fields, while a
 * dialog or menu is open, during IME composition, or already handled (dnd-kit)
 * never run commands; macOS app-menu keys are reserved in the shared registry.
 */
export function KeyboardCommands({ userId, onCapture, onSidebar, onFind, onNewGoal }: { userId: string; onCapture: () => void; onSidebar: () => void; onFind: (sectionsOnly?: boolean) => void; onNewGoal: () => void | boolean }) {
  const navigate = useNavigate();
  const cache = useQueryClient();
  const { effective, syncError } = useShortcuts(userId);
  const [help, setHelp] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const handlers = useRef<Partial<Record<ClientCommandId, () => void | boolean>>>({});
  // Collapsed sub-tasks are page state (legacy provider per page).
  const { pathname, hash, key } = useLocation();
  useEffect(() => collapsedTasks.set(new Set()), [pathname]);
  // A `#task-<id>` link (shared, or Shift+G) scrolls to and focuses that row once the list renders.
  useEffect(() => {
    if (!hash.startsWith("#task-")) return;
    const selector = `main [data-task-id="${CSS.escape(hash.slice(6))}"]:not([hidden]) :is(${TITLE})`;
    let live = true;
    void waitFor(() => live ? document.querySelector<HTMLElement>(selector) : null, 10_000).then(title => {
      if (!live || !title) return;
      title.scrollIntoView?.({ block: "center" });
      title.focus();
    });
    return () => { live = false; };
  }, [key, hash]);
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
  const openSettings = useOpenSettings();
  const update = useTaskWrites(userId).update;
  const latest = useRef({ navigate, openSettings, onCapture, onSidebar, onFind, onNewGoal, cache, metadata, clearDates, organize, update });
  latest.current = { navigate, openSettings, onCapture, onSidebar, onFind, onNewGoal, cache, metadata, clearDates, organize, update };
  useEffect(() => { if (!notice) return; const id = setTimeout(() => setNotice(null), 6000); return () => clearTimeout(id); }, [notice]);
  // Goals ticket 17d: the Coach error toasts' actions open Settings › Coach (a provider's card, or a control in it).
  useEffect(() => connectCoachErrors({
    cache, userId, transport: coach,
    openCard: (kind, action) => {
      if (!document.querySelector("[data-coach-settings]")) latest.current.openSettings("coach");
      if (!kind) return;
      // The dialog renders after navigation: wait for the card (up to 3 s), then open it and press the control.
      let tries = 0;
      const find = () => {
        if (document.querySelector(`[data-coach-settings] [data-coach-card="${kind}"]`)) return void coachCard(kind, action ? `[data-coach-action="${action}"]` : "[data-coach-none]");
        if (++tries < 30) setTimeout(find, 100);
      };
      find();
    },
  }), [cache, userId]);

  useEffect(() => {
    const go = (path: string) => () => void latest.current.navigate(path);
    const openHelp = () => { opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setHelp(true); };
    const all = async () => (await latest.current.cache.fetchQuery(reads.today(userId))).tasks;
    // Toasted write failures (toasts.ts) are not repeated in the notice.
    const write = (action: () => Promise<unknown>) => { setNotice(null); action().catch((reason: unknown) => setNotice(inlineError(reason))); };
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
    // Rituals read from the cache; before it has loaded (e.g. goals hidden in the sidebar), fetch it first.
    const withRituals = (run: (state: RitualsDto) => unknown) => {
      const state = latest.current.cache.getQueryData<RitualsDto>(ritualKeys.all(userId));
      if (state) { run(state); return; }
      void latest.current.cache.fetchQuery(ritualReads.state(userId)).then(run).catch(() => {});
    };
    const candidate = () => document.activeElement?.closest<HTMLElement>("[data-check-in-candidate]") ?? document.querySelector<HTMLElement>("[data-ritual-panel] [data-check-in-candidate]");
    const ritualOff = (name: string) => {
      const id = `ritual-off-${name}`;
      toasts.add({ id, title: `${name} is off`, description: "Turn it on in Settings › Rituals to start it from here.",
        actionProps: { children: "Open settings", onClick: () => { toasts.close(id); latest.current.openSettings("rituals"); } } });
    };
    handlers.current = {
      "general.capture": () => latest.current.onCapture(), "goal.create": () => latest.current.onNewGoal(), "general.ramble": go("/ramble"), "navigation.ui": go("/ui"), "general.sidebar": () => latest.current.onSidebar(),
      "general.help": openHelp, "navigation.help": openHelp,
      "general.search": () => latest.current.onFind(), "general.quick-find": () => latest.current.onFind(),
      // ⌘R / Ctrl+R: the toolbar's Sync now (consumed, so the page never reloads).
      "general.sync": () => press(document, "[data-sync-now]"),
      "navigation.inbox": go("/inbox"), "navigation.sections": () => latest.current.onFind(true), "navigation.today": go("/today"), "navigation.upcoming": go("/upcoming"), "navigation.projects": go("/projects"),
      "navigation.labels": go("/labels"), "navigation.filters": go("/filters"), "navigation.settings": () => latest.current.openSettings(), "navigation.account": () => latest.current.openSettings("account"), "navigation.theme": () => theme.toggle(),
      "task.previous": listOrSheet(() => sheetRow(-1), () => moveRow(-1)), "task.next": listOrSheet(() => sheetRow(1), () => moveRow(1)),
      "view.first": () => moveRow(-Infinity), "view.last": () => moveRow(Infinity),
      // Enter on the title opens it; Enter on the row's buttons keeps their own action.
      "task.details": listOrSheet(sheetOpen, () => { const title = activeRow()?.querySelector<HTMLElement>(TITLE); if (!title || document.activeElement !== title) return false; title.click(); }),
      // ⌘E: the quick add editor in place of the row (the sheet where there is none); in the sheet, its title.
      "task.edit": listOrSheet(() => { document.querySelector<HTMLElement>(".task-sheet .sheet-title")?.focus(); }, () => clickInRow(activeRow()?.querySelector("[data-edit]") ? "[data-edit]" : TITLE)),
      "task.complete": listOrSheet(sheetComplete, () => clickAndRefocus('button[role="checkbox"]')),
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
      "editor.save": () => press(editorForm(), '[data-save], button[type="submit"]'),
      // Focuses the description, opening it first (Add description) as legacy did.
      "quick-add.description": () => { const form = inComposerTitle(); const field = form && form.querySelector<HTMLElement>('[aria-label="Description"], .add-description, [data-composer-more]'); if (!field) return false; if (field.matches("button")) field.click(); else field.focus(); },
      "quick-add.actions": () => metadataField("priority"),
      "quick-add.deadline": () => metadataField("deadline"),
      "task.date": () => picker(null, "date"),
      "task.clear-date": () => rowWrite(tasks => latest.current.clearDates.mutateAsync({ tasks })),
      "task.priority-1": () => rowWrite(tasks => latest.current.metadata.mutateAsync({ tasks, change: { priority: 1 } })),
      "task.priority-2": () => rowWrite(tasks => latest.current.metadata.mutateAsync({ tasks, change: { priority: 2 } })),
      "task.priority-3": () => rowWrite(tasks => latest.current.metadata.mutateAsync({ tasks, change: { priority: 3 } })),
      "task.priority-4": () => rowWrite(tasks => latest.current.metadata.mutateAsync({ tasks, change: { priority: 4 } })),
      "task.priority": () => picker("priority", "priority"),
      // Goals ticket 31: h then n, x or l.
      "task.horizon-now": () => rowWrite(tasks => latest.current.metadata.mutateAsync({ tasks, change: { horizon: "now" } })),
      "task.horizon-next": () => rowWrite(tasks => latest.current.metadata.mutateAsync({ tasks, change: { horizon: "next" } })),
      "task.horizon-later": () => rowWrite(tasks => latest.current.metadata.mutateAsync({ tasks, change: { horizon: "later" } })),
      "task.labels": () => picker("labels", "labels"),
      "task.goals": () => picker(null, "goals"),
      // Absent until the task has a linked goal: the sheet opens without focusing a field.
      "task.milestone": () => picker(null, "milestone"),
      // The open sheet's goal hint (ticket 03); no hint, the key passes on.
      "editor.goal-suggestion-accept": () => press(document.querySelector(".task-editor"), '[data-suggestion="accept"]'),
      "editor.goal-suggestion-dismiss": () => press(document.querySelector(".task-editor"), '[data-suggestion="dismiss"]'),
      "task.deadline": () => picker("deadline", "deadline"),
      "task.clear-deadline": () => rowWrite(tasks => latest.current.metadata.mutateAsync({ tasks, change: { deadline: null } })),
      "task.move": moveDialog,
      // Indent: under the previous sibling (the nearest row above at the same level), only in Manual sort.
      "task.nest": () => {
        const row = activeRow();
        if (!row) return false;
        if (!sortable()) return void setNotice("Switch Sort to Manual to nest tasks.");
        const above = visibleTasks()[visibleTasks().indexOf(row) - 1];
        write(async () => {
          const { tasks, task } = await focusedTask(row);
          const byId = new Map(tasks.map(item => [item.id, item]));
          let parent = above ? byId.get(above.dataset.taskId!) : undefined;
          while (parent && task && parent.parentId !== task.parentId) parent = parent.parentId ? byId.get(parent.parentId) : undefined;
          if (!task || !parent || !parentCandidates(task, tasks).includes(parent)) throw new Error(`Choose a task below the task you want to nest under (up to ${MAX_SUBTASK_DEPTH} levels).`);
          await latest.current.organize.mutateAsync({ task, change: { parentId: parent.id } });
        });
      },
      "task.unnest": () => {
        const row = activeRow();
        if (!row) return false;
        if (!sortable()) return void setNotice("Switch Sort to Manual to nest tasks.");
        // Outdent one level: the task becomes a sibling of its parent.
        write(async () => {
          const { tasks, task } = await focusedTask(row);
          if (task?.parentId) await latest.current.organize.mutateAsync({ task, change: { parentId: tasks.find(item => item.id === task.parentId)?.parentId ?? null } });
        });
      },
      "editor.previous": () => editAdjacent(-1), "editor.next": () => editAdjacent(1),
      "project.section": () => press(document.querySelector("main"), '[data-project-action="section"]'),
      "project.menu": () => press(document.querySelector("main"), '[data-project-action="menu"]'),
      // Absent while Goals is hidden: the key passes on.
      "project.goals": () => press(document.querySelector("main"), '[data-project-action="goals"]'),
      // Goals ticket 04: the Season page's buttons; elsewhere (or with Goals hidden) the key passes on.
      "navigation.season": () => { if (latest.current.cache.getQueryData<GoalsDto>(goalKeys.list(userId))?.hidden !== false) return false; latest.current.navigate("/season"); },
      "season.start": () => press(document.querySelector("main"), '[data-season-action="start"]'),
      "season.add-goal": () => press(document.querySelector("main"), '[data-season-action="add-goal"]'),
      "season.move-target": () => press(document.activeElement?.closest("[data-season-goal]") ?? null, '[data-season-goal-action="target"]'),
      "season.toggle-tier": () => press(document.activeElement?.closest("[data-season-goal]") ?? null, '[data-season-goal-action="tier"]'),
      // The focused goal's switch: included goals leave the season, others open their tier and target.
      "season.remove-goal": () => press(document.activeElement?.closest("[data-season-goal]") ?? null, '[data-season-goal-action="include"]'),
      "season.end": () => press(document.querySelector("main"), '[data-season-action="end"]'),
      "season.chart": () => { const first = document.querySelector<HTMLElement>("main [data-season-chart-goal]"); if (!first) return false; first.focus(); },
      // d: a focused row's deadline wins; focus the page (Escape) to sort.
      "project.sort-date": () => sort("date", true), "project.sort-name": () => sort("name"), "project.sort-priority": () => sort("priority"),
      // Next layout (the toolbar arrow); focus returns to the list when the focused element left with the old layout.
      "view.layout": () => {
        const was = document.activeElement;
        if (press(document, '[aria-label="Next layout"]') === false) return false;
        requestAnimationFrame(() => { if (was instanceof HTMLElement && !was.isConnected) (visibleTasks()[0]?.querySelector<HTMLElement>(TITLE) ?? document.querySelector<HTMLElement>("main"))?.focus(); });
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
      // Shift+G: the task's project (else the Inbox); the `#task-` effect focuses its row there.
      "task.reveal": () => {
        const row = activeRow();
        if (!row) return false;
        write(async () => {
          const { task } = await focusedTask(row);
          if (task) await latest.current.navigate(`${task.projectId ? `/projects/${encodeURIComponent(task.projectId)}` : "/inbox"}#task-${task.id}`);
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
      // Goals ticket 14c: the Plan sidebar; pass on away from the schedule (or with the sidebar closed).
      "schedule.unscheduled": () => press(document.querySelector("main"), '[data-schedule-action="plan"]'),
      "schedule.filter": () => { const first = document.querySelector<HTMLElement>('main [data-plan] [data-plan-filter="first"]'); if (!first) return false; first.focus(); },
      "plan.reschedule-overdue": () => press(document.querySelector("main [data-plan]"), '[data-plan-action="reschedule"]'),
      "plan.add-task": () => press(document.querySelector("main [data-plan]"), '[data-plan-action="add"]'),
      // The focused task (row, card or schedule block) keeps its day and loses its time; passes on without one.
      "task.unschedule": () => {
        const row = activeRow();
        if (!row) return false;
        write(async () => { const { task } = await focusedTask(row); if (task && isTimed(task)) await latest.current.update.mutateAsync({ id: task.id, details: unscheduledDetails(task) }); });
      },
      "schedule.task": () => press(activeRow()?.closest("[data-plan]") ? activeRow() : null, '[data-plan-action="schedule"]'),
      // Goals ticket 11: a ritual that is off says so and offers its settings, instead of doing nothing.
      "ritual.check-in": () => withRituals(state => state.settings.checkIn.enabled ? openRitual("checkIn") : ritualOff("Check-in")),
      "ritual.evening-review": () => withRituals(state => state.settings.eveningReview.enabled ? openRitual("eveningReview") : ritualOff("Evening review")),
      // Goals ticket 14b: the Check-in's suggested task with focus inside it, else the first.
      "ritual.schedule-candidate": () => press(candidate(), '[data-ritual-action="schedule"]'),
      "ritual.leave-candidate": () => press(candidate(), '[data-ritual-action="leave"]'),
      "ritual.search-candidates": () => { const field = document.querySelector<HTMLInputElement>("main [data-plan] [data-plan-search] input"); if (!field) return false; field.focus(); },
      "ritual.next": () => press(document.querySelector("[data-ritual-panel]"), '[data-ritual-action="next"], [data-ritual-action="done"]'),
      "ritual.weekly-review": () => withRituals(state => state.settings.weeklyReview.enabled ? openRitual("weeklyReview") : ritualOff("Weekly review")),
      "ritual.season-review": () => withRituals(state => !state.settings.seasonReview.enabled ? ritualOff("Season review")
        : state.seasonReview.period ? openRitual("seasonReview") : toasts.add({ title: "No season is running", description: "Start a season to review it." })),
      "coach.settings": () => latest.current.openSettings("coach"),
      // On Settings › Coach the button shows the result inline; elsewhere a toast does.
      "coach.test": () => {
        if (press(document.querySelector("[data-coach-settings]"), '[data-coach-action="test"]') !== false) return;
        if (modalOpen()) return false;
        const failed = (description?: string) => toasts.add({ title: "Coach connection failed", description: description ?? "Try again, or check Settings › Coach." });
        // Ticket 17d: a model failure gets its toast with the step that helps (Retry tests again).
        const run = () => void coach.test().then(result => result.ok ? toasts.add({ title: "Coach connected", description: "The model answered." })
          : reportCoachError(result.error, { retry: run }) || failed(result.message), () => failed());
        run();
      },
      // Goals ticket 18: ChatGPT sign-in on Settings › Coach.
      "coach.chatgpt-sign-in": () => {
        const settings = document.querySelector("[data-coach-settings]");
        if (!settings) return modalOpen() ? false : latest.current.openSettings("coach");
        return coachCard("chatgpt", '[data-coach-action="chatgpt-sign-in"]');
      },
      "coach.chatgpt-open": () => press(document.querySelector("[data-coach-chatgpt]"), '[data-coach-action="chatgpt-open"]'),
      // Goals ticket 24: Learn now on Settings › Coach; elsewhere opens it.
      "coach.learn-patterns": () => {
        const settings = document.querySelector("[data-coach-settings]");
        if (!settings) return modalOpen() ? false : latest.current.openSettings("coach");
        return press(settings, '[data-pattern-action="learn"]');
      },
      "coach.chatgpt-sign-out": () => coachCard("chatgpt", '[data-coach-action="chatgpt-sign-out"]'),
      // Goals ticket 17c: the next configured provider becomes the active one (the picker shows it).
      "coach.next-provider": () => {
        const { cache } = latest.current;
        void cache.fetchQuery(coachReads.provider(userId)).then(async state => {
          const usable = usableCoachProviders(state);
          const next = nextCoachProvider(usable, state.provider?.provider ?? null);
          if (usable.length < 2 || !next) return toasts.add({ title: "No other Coach provider", description: "Set up another one in Settings › Coach." });
          const after = await coachMutations(coach, cache, userId).setActive(next);
          toasts.add({ title: `Coach uses ${coachProviderInfo[next].label}`, description: after.provider?.model });
        }).catch(() => toasts.add({ title: "Could not switch the Coach's provider", description: "Try again." }));
      },
      // Goals ticket 19: the Coach's draft of today in the Plan sidebar.
      "coach.draft-day": () => press(document.querySelector("[data-plan]"), '[data-coach-action="draft-day"]'),
      // Ticket 20: the week's draft beside the week calendar.
      "coach.draft-week": () => press(document.querySelector("[data-plan]"), '[data-coach-action="draft-week"]'),
      "coach.accept-draft": () => press(document, '[data-coach-draft] [data-draft-action="accept-all"]'),
      "coach.decline-draft": () => press(document, '[data-coach-draft] [data-draft-action="decline-all"]'),
      "coach.overflow-schedule": () => press(document, '[data-coach-draft] [data-draft-action="overflow-schedule"]'),
      "coach.overflow-drop": () => press(document, '[data-coach-draft] [data-draft-action="overflow-drop"]'),
      // Ticket 22: the toolbar's Coach button exists only with a provider connected.
      "coach.chat": () => { if (!document.querySelector("[data-coach-chat-toggle]")) return false; toggleCoachSidebar(); },
      "coach.bar": () => { if (!document.querySelector("[data-coach-bar]")) return false; focusCoachBar(); },
      "coach.attach": () => press(document.querySelector("[data-coach-bar]"), '[data-coach-bar-action="attach"]'),
      "coach.chat-clear": () => press(document.querySelector("[data-coach-chat]"), '[data-coach-chat-action="clear"]'),
      // Ticket 23: the goal page shown, else the season's first primary goal.
      "coach.planning": () => {
        if (!document.querySelector("[data-coach-chat-toggle]")) return false;
        openPlanning({ goalId: document.querySelector<HTMLElement>("main [data-goal-id]")?.dataset.goalId, source: "goal" });
      },
      "coach.planning-draft": () => press(document.querySelector("[data-planning]"), '[data-planning-action="draft-now"]'),
      // Ticket 21: the Season page's recommendation holding focus, else the first.
      "coach.recommendation-schedule": () => press(recommendation(), '[data-recommendation-action="schedule"]'),
      "coach.recommendation-chat": () => press(recommendation(), '[data-recommendation-action="chat"]'),
      "coach.recommendation-dismiss": () => press(recommendation(), '[data-recommendation-action="dismiss"]'),
      // Ticket 25: the Season page's capacity field (shown only with a Coach provider and a primary goal).
      "season.capacity": () => { const input = document.querySelector<HTMLInputElement>("#season-capacity"); if (!input) return false; input.focus(); input.select(); },
      "ritual.skip": () => press(document.querySelector("[data-ritual-panel]"), '[data-ritual-action="skip"]'),
      // Goals ticket 13: the Weekly review's planning question; passes on until it is shown.
      "ritual.plan-clear": () => press(document.querySelector("[data-ritual-panel]"), '[data-ritual-action="plan-clear"]'),
      "ritual.plan-help": () => press(document.querySelector("[data-ritual-panel]"), '[data-ritual-action="plan-help"]'),
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
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("blur", reset); document.removeEventListener("focusin", reset); };
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
        .catch((reason: unknown) => setNotice(inlineError(reason)));
      if (action) handlers.current[menuCommands[action]]?.();
    });
  };
  return <>
    {notice && <p role="alert" className="keyboard-notice">{notice}</p>}
    {status && <p role="status" className="keyboard-notice">{status}</p>}
    {syncError && <div role="status" className="shortcut-sync">{syncError} <button type="button" className="text-action" onClick={() => openSettings("keyboard-shortcuts")}>Shortcut settings</button></div>}
    {menu && <TaskMenu title={menu.querySelector(TITLE)?.textContent ?? ""} onChoose={closeMenu} onClose={() => closeMenu()} />}
    {help && <ShortcutHelp bindings={id => effectiveBindings(id, effective, platform)} onClose={close}
      onCustomize={() => { setHelp(false); openSettings("keyboard-shortcuts"); }} />}
  </>;
}

/** Settings › Keyboard shortcuts; a save replaces the account document and refreshes every open screen. */
export function ShortcutSettingsScreen({ userId }: { userId: string }) {
  const cache = useQueryClient();
  const { query, preferences, effective, syncError } = useShortcuts(userId);
  const [help, setHelp] = useState(false);
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
