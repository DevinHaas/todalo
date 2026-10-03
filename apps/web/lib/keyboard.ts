// Browser-independent command model. Native desktop adapters can reuse this registry.
export type Platform = "mac" | "windows" | "linux";
export type CommandContext = "global" | "view" | "task" | "editor" | "quick-add" | "project" | "upcoming" | "calendar";
export type Availability = "available" | "planned" | "excluded" | "native" | "disputed";
export interface KeyboardCommand {
  id: string; label: string; group: string; context: CommandContext;
  defaults: string[]; platformDefaults?: Partial<Record<Platform, string[]>>;
  availability: Availability; stage?: number; repeat?: boolean; note?: string;
}
const command = (id: string, label: string, group: string, context: CommandContext, defaults: string[], stage = 1, extra: Partial<KeyboardCommand> = {}): KeyboardCommand =>
  ({ id, label, group, context, defaults, stage, availability: "planned", ...extra });
export const keyboardCommands: KeyboardCommand[] = [
  command("general.capture", "Capture task", "General", "global", ["q"], 1, { availability: "available" }),
  command("general.ramble", "Open Ramble", "General", "global", ["Primary+Shift+r"], 1, { availability: "available", note: "Todalo in-app voice capture; desktop global capture is excluded." }),
  command("general.sidebar", "Toggle sidebar", "General", "global", ["m"], 1, { availability: "available" }),
  command("general.help", "Show keyboard shortcuts", "General", "global", ["?"], 1, { availability: "available" }),
  command("general.dismiss", "Dismiss or cancel", "General", "editor", ["Escape"]),
  command("general.search", "Search", "General", "global", ["/", "f"], 2, { availability: "available" }),
  command("general.quick-find", "Quick Find", "General", "global", ["Primary+k"], 2, { availability: "available" }),
  command("view.toggle-nested", "Toggle nested tasks and sections", "Task actions", "view", ["Primary+Alt+0"], 2, { availability: "available" }),
...[["home", "Home", ["h", "g then h"], 2], ["inbox", "Inbox", ["g then i"], 2], ["today", "Today", ["g then t"], 1], ["upcoming", "Upcoming", ["g then u"], 1], ["labels", "Labels", ["g then l"], 3], ["projects", "Projects", ["g then p"], 2], ["sections", "Navigate sections", ["g then /"], 2], ["filters", "Filters & Labels", ["g then v"], 3], ["settings", "Settings", ["o then s"], 1], ["help", "Help & resources", ["o then h"], 1], ["account", "Account menu", ["o then u"], 1], ["theme", "Toggle theme", ["o then t"], 1]].map(([id, label, keys, stage]) => command(`navigation.${id}`, label as string, "Navigation", "global", keys as string[], stage as number, { availability: ["home", "inbox", "projects", "sections", "today", "upcoming", "settings", "help", "account", "theme"].includes(id as string) ? "available" : "planned" })),
  command("task.previous", "Previous task", "Navigation", "view", ["k", "ArrowUp"], 1, { repeat: true }),
  command("task.next", "Next task", "Navigation", "view", ["j", "ArrowDown"], 1, { repeat: true }),
  command("task.left", "Move focus left", "Navigation", "view", ["ArrowLeft"], 1, { repeat: true }),
  command("task.right", "Move focus right", "Navigation", "view", ["ArrowRight"], 1, { repeat: true }),
  command("task.reveal", "Reveal task in project", "Navigation", "task", ["Shift+g"], 2, { availability: "available" }),
  command("task.add-bottom", "Add task at bottom", "Quick Add", "view", ["a"]),
  command("task.add-top", "Add task at top", "Quick Add", "view", ["Shift+a"]),
  command("editor.submit-below", "Submit task and add below", "Quick Add", "quick-add", ["Enter"]),
  command("editor.save-below", "Save edited task and add below", "Quick Add", "editor", ["Shift+Enter"]),
  command("editor.save-above", "Save task and add above", "Quick Add", "quick-add", ["Ctrl+Enter"]),
  command("editor.save", "Save task details", "Task actions", "editor", ["Primary+Enter"]),
  command("editor.previous", "Previous task while editing", "Task actions", "editor", ["Primary+ArrowUp"]),
  command("editor.next", "Next task while editing", "Task actions", "editor", ["Primary+ArrowDown"]),
  command("task.complete", "Complete task", "Task actions", "task", ["e"]),
  command("task.details", "Open task details", "Task actions", "task", ["Enter"]),
  command("task.edit", "Edit task", "Task actions", "task", ["Primary+e"]),
  command("task.date", "Choose date", "Task actions", "task", ["t"]),
  command("task.clear-date", "Clear date", "Task actions", "task", ["Shift+t"]),
  ...[1, 2, 3, 4].map(priority => command(`task.priority-${priority}`, `Set priority ${priority}`, "Task actions", "task", [String(priority)], 3)),
  command("task.priority", "Choose priority", "Task actions", "task", ["y"], 3),
  command("task.labels", "Edit labels", "Task actions", "task", ["l"], 3),
  command("task.move", "Move task", "Task actions", "task", ["v"], 2, { availability: "available" }),
  command("task.menu", "Task action menu", "Task actions", "task", ["."]),
  command("task.select", "Select focused task", "Task actions", "task", ["x"], 1, { note: "Windows web omits X; desktop documents it. Todalo adopts the documented desktop binding." }),
  command("task.toolbar", "Focus selection toolbar", "Task actions", "task", [","]),
  command("task.delete", "Delete selected tasks", "Task actions", "task", ["Shift+Delete"], 1, { platformDefaults: { mac: ["Meta+Backspace"] } }),
  command("task.copy-url", "Copy task URL", "Task actions", "task", ["Primary+Shift+c"], 3),
  command("task.nest", "Nest task", "Task actions", "task", ["Ctrl+]"], 2, { availability: "available", note: "Explicit Control on macOS; use a custom binding on layouts without dedicated brackets." }),
  command("task.unnest", "Unnest task", "Task actions", "task", ["Ctrl+["], 2, { availability: "available" }),
  command("task.toggle-children", "Toggle child tasks", "Task actions", "task", ["Shift+e"], 2, { availability: "available" }),
  command("view.layout", "Switch layout", "Views", "view", ["Shift+v"], 4, { availability: "available" }),
  command("project.section", "Create section", "Projects", "project", ["s"], 2, { availability: "available" }),
  command("project.sort-date", "Sort by date", "Projects", "project", ["d"], 2, { availability: "available", note: "Uses web project baseline D; macOS sorting subsection contradicts with Option+D. Focused task deadline takes precedence; focus the project header to sort." }),
  command("project.sort-priority", "Sort by priority", "Projects", "project", ["p"], 3, { note: "Web project baseline; macOS Option+P entry is disputed." }),
  command("project.sort-name", "Sort by name", "Projects", "project", ["n"], 2, { availability: "available", note: "Web project baseline; macOS Option+N entry is disputed." }),
  command("project.menu", "Project action menu", "Projects", "project", ["w"], 2, { availability: "available" }),
  command("view.first", "First task", "Navigation", "view", ["Ctrl+Home"], 2, { platformDefaults: { mac: ["Meta+ArrowUp"] } }),
  command("view.last", "Last task", "Navigation", "view", ["Ctrl+End"], 2, { platformDefaults: { mac: ["Meta+ArrowDown"] } }),
  command("upcoming.today", "Upcoming: go to today", "Upcoming", "upcoming", ["Home"], 4, { availability: "available", platformDefaults: { mac: ["Alt+Shift+y"] } }),
  command("upcoming.next-week", "Upcoming: next week", "Upcoming", "upcoming", ["Shift+ArrowRight"], 4, { availability: "available" }),
  command("upcoming.previous-week", "Upcoming: previous week", "Upcoming", "upcoming", ["Shift+ArrowLeft"], 4, { availability: "available" }),
  command("calendar.today", "Calendar: go to today", "Calendar", "calendar", ["t"], 4, { availability: "available", platformDefaults: { mac: ["t", "Alt+Shift+y"] }, note: "Windows Option+Shift+Y is unresolved and not silently adapted." }),
  command("calendar.next-week", "Calendar: next week", "Calendar", "calendar", ["Shift+ArrowRight"], 4, { availability: "available" }),
  command("calendar.previous-week", "Calendar: previous week", "Calendar", "calendar", ["Shift+ArrowLeft"], 4, { availability: "available" }),
  command("task.paste-file", "Paste file as a task", "Quick Add", "project", ["Primary+v"], 4),
  command("quick-add.description", "Reveal description", "Quick Add", "quick-add", ["ArrowDown"], 3),
  command("quick-add.actions", "Reveal additional actions", "Quick Add", "quick-add", ["Shift+ArrowDown"], 3),
  command("quick-add.deadline", "Choose deadline while composing", "Quick Add", "quick-add", ["{"], 3),
  command("task.deadline", "Choose deadline", "Task actions", "task", ["d"], 3, { note: "Changelog default; task context takes precedence over project sorting." }),
  command("task.clear-deadline", "Clear deadline", "Task actions", "task", ["Shift+d"], 3),
  ...[["print", "Print view", "Primary+p"], ["zoom-in", "Increase zoom", "Primary+="], ["zoom-out", "Decrease zoom", "Primary+-"], ["zoom-reset", "Reset zoom", "Primary+0"], ["focus-next", "Advance focus", "Tab"], ["focus-previous", "Reverse focus", "Shift+Tab"], ["history-back", "Browser history back", "Primary+["], ["history-forward", "Browser history forward", "Primary+]"]].map(([id, label, key]) => command(`native.${id}`, label!, "Browser", "global", [key!], 0, { availability: "native", ...(id === "history-back" ? { platformDefaults: { windows: ["Alt+ArrowLeft"], linux: ["Alt+ArrowLeft"] } } : id === "history-forward" ? { platformDefaults: { windows: ["Alt+ArrowRight"], linux: ["Alt+ArrowRight"] } } : {}), note: "Preserved browser behavior; customization is unavailable." })),
  ...[["reporting", "Reporting", "g then a"], ["productivity", "Productivity", "o then p"], ["notifications", "Notifications", "o then n"], ["comments", "Task comments", "c"], ["assignee", "Choose assignee", "Shift+r"], ["share", "Share project", "Shift+s"], ["sort-assignee", "Sort by assignee", "r"], ["insights", "Project Insights", "i"], ["project-comments", "Project comments", "c"]].map(([id, label, key]) => command(`excluded.${id}`, label!, "Deferred collaboration", "global", [key!], 0, { availability: "excluded" })),
  ...[["global-capture", "Desktop global capture", "Alt+Space"], ["global-voice", "Desktop global voice capture (new installs)", "Alt+Shift+r"], ["global-voice-legacy", "Desktop global voice capture (existing installs)", "Alt+Shift+Space"], ["window-toggle", "Show/hide desktop window", "Meta+Ctrl+t"], ["window-duplicate", "Duplicate desktop window", "Primary+Shift+n"], ["window-home", "New desktop Home window", "Primary+Alt+Shift+n"], ["window-pin", "Keep desktop window above others", "Meta+Alt+f"]].map(([id, label, key]) => command(`excluded.${id}`, label!, "Desktop", "global", [key!], 0, { availability: "excluded", ...(id === "global-capture" ? { platformDefaults: { windows: ["Ctrl+Space"] } } : id === "global-voice-legacy" ? { platformDefaults: { windows: ["Alt+Space"] } } : id === "window-pin" ? { platformDefaults: { windows: ["Ctrl+F11"] } } : {}), note: "Native desktop capability; see research for Windows and legacy alternatives." })),
  command("disputed.windows-calendar", "Windows calendar Option+Shift+Y", "Research discrepancies", "calendar", ["Alt+Shift+y"], 0, { availability: "disputed", note: "Source prints Option; this alternative is not enabled." }),
  ...[["recurring-archive", "Complete and archive recurring task (Shift+Click)"], ["mouse-edit", "Edit with Option/Alt+Click"], ["mouse-select", "Toggle selection with Command/Control+Click"], ["mouse-multiselect", "Select multiple tasks with modifier/Shift+Click"]].map(([id, label]) => command(`excluded.${id}`, label!, "Mouse gestures", "global", [], 0, { availability: "excluded" })),
  ...[["priority", "p1–p4 priority tokens"], ["project", "#project token"], ["section", "/section token"], ["assignee", "+assignee token"], ["label", "%label and legacy @label tokens"], ["reminder", "!time reminder token"], ["deadline", "{date} deadline token"], ["date", "Natural-language date, time and recurrence"]].map(([id, label]) => command(`syntax.${id}`, label!, "Text syntax", "quick-add", [], 0, { availability: "excluded", note: "Text parsing is separate from keyboard customization; existing parsing is preserved." })),
  ...[["capture", "Mobile capture (Command/Control+N)"], ["routes", "Mobile Inbox/Today/Upcoming (modifier+1/2/3)"], ["lists", "Mobile list/label/filter navigation (modifier+4/5)"], ["create", "Mobile project/label/filter creation (modifier+Shift+P/L/F)"], ["search", "Mobile search (modifier+F)"], ["settings", "Mobile settings (modifier+,)"], ["sync", "Mobile synchronization (modifier+S)"], ["top", "Android top task creation (Ctrl+Shift+N)"], ["comment", "Android save comment (Ctrl+Enter)"], ["urgent", "iOS urgent reminder (!time!)"]].map(([id, label]) => command(`mobile.${id}`, label!, "Mobile", "global", [], 0, { availability: "excluded", note: "Separate mobile hardware-keyboard scope; source duplicates label/filter modifier+5." })),
].map(item => (["general.dismiss", "task.previous", "task.next", "task.left", "task.right", "view.first", "view.last", "task.add-bottom", "task.add-top", "editor.submit-below", "editor.save-below", "editor.save-above", "editor.save", "editor.previous", "editor.next", "task.complete", "task.details", "task.edit", "task.date", "task.clear-date", "task.menu", "task.select", "task.toolbar", "task.delete"].includes(item.id) ? { ...item, availability: "available" as const } : item));

export interface KeyboardPreferences {
  version: 1;
  registryVersion: number;
  overrides: Record<string, string[]>;
  platforms: Partial<Record<Platform, Record<string, string[]>>>;
  // Previous complete effective sets permit safe default migrations without overwriting customizations.
  lastEffective?: Partial<Record<Platform, Record<string, string[]>>>;
}
export const REGISTRY_VERSION = 1;
export const defaultPreferences = (): KeyboardPreferences => ({ version: 1, registryVersion: REGISTRY_VERSION, overrides: {}, platforms: {} });
export function adaptBinding(binding: string, platform: Platform) { return binding.replaceAll("Primary+", platform === "mac" ? "Meta+" : "Ctrl+"); }
export function effectiveBindings(id: string, preferences: KeyboardPreferences, platform: Platform, registry = keyboardCommands): string[] {
  const item = registry.find(command => command.id === id);
  const bindings = preferences.platforms[platform]?.[id] ?? preferences.overrides[id] ?? item?.platformDefaults?.[platform] ?? item?.defaults ?? [];
  return bindings.map(binding => adaptBinding(binding, platform));
}
export interface BindingError { commandId: string; platform: Platform; message: string; otherId?: string }
const modifiers = ["Meta", "Ctrl", "Alt", "Shift", "Primary"];
export function normalizeBinding(binding: string): string | null {
  const steps = binding.split(/\s+then\s+/i);
  if (!steps.length || steps.length > 3) return null;
  const normalized = steps.map(step => {
    const parts = step.trim().split("+");
    const key = parts.pop();
    if (!key || !parts.every(part => modifiers.includes(part)) || new Set(parts).size !== parts.length || (parts.includes("Primary") && (parts.includes("Ctrl") || parts.includes("Meta")))) return null;
    if (!(key.length === 1 || /^(Space|Enter|Escape|Backspace|Delete|Home|End|PageUp|PageDown|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|F\d{1,2})$/.test(key))) return null;
    return [...modifiers.filter(modifier => parts.includes(modifier)), key.length === 1 ? key.toLowerCase() : key].join("+");
  });
  return normalized.some(step => step === null) ? null : normalized.join(" then ");
}
export function reservedBinding(binding: string, platform: Platform): string | null {
  for (const step of binding.split(" then ")) {
    if (/^(Tab|Shift\+Tab)$/.test(step)) return "Tab is reserved for normal focus traversal.";
    if (/^(Meta\+q|Meta\+w|Meta\+t|Meta\+n|Meta\+l|Meta\+Shift\+[ntw]|Ctrl\+w|Ctrl\+t|Ctrl\+n|Ctrl\+l|Ctrl\+Shift\+[ntw]|Alt\+F4|Ctrl\+Alt\+Delete|F5|F11|F12)$/.test(step)) return "This combination is reserved by the browser or operating system.";
    if (platform === "mac" && /^(Meta\+Space|Meta\+Tab|Ctrl\+Arrow(Up|Down|Left|Right))$/.test(step)) return "This combination is reserved by macOS.";
  }
  return null;
}
// Specialized contexts have explicit dispatch precedence. Global bindings overlap every app context.
export function contextsOverlap(a: CommandContext, b: CommandContext) { return a === b || (a === "global" && b !== "editor" && b !== "quick-add") || (b === "global" && a !== "editor" && a !== "quick-add"); }
export function validatePreferences(preferences: KeyboardPreferences, registry = keyboardCommands): BindingError[] {
  const errors: BindingError[] = [];
  for (const platform of ["mac", "windows", "linux"] as const) {
    const assignments: { command: KeyboardCommand; binding: string }[] = [];
    for (const item of registry) {
      const override = preferences.platforms[platform]?.[item.id] ?? preferences.overrides[item.id];
      if (["excluded", "native", "disputed"].includes(item.availability)) {
        if (override !== undefined) errors.push({ commandId: item.id, platform, message: "This action cannot be customized in the browser." });
        continue;
      }
      const seen = new Set<string>();
      for (const binding of effectiveBindings(item.id, preferences, platform, registry)) {
        const normalized = normalizeBinding(binding);
        const reserved = normalized && reservedBinding(normalized, platform);
        if (!normalized || reserved || seen.has(normalized)) {
          errors.push({ commandId: item.id, platform, message: reserved ?? (!normalized ? "Use a key, chord or up to three sequence steps." : "Duplicate binding for this action.") });
          continue;
        }
        seen.add(normalized);
        assignments.push({ command: item, binding: normalized });
      }
    }
    for (let i = 0; i < assignments.length; i++) for (let j = i + 1; j < assignments.length; j++) {
      const a = assignments[i]!; const b = assignments[j]!;
      if (a.command.id === b.command.id || !contextsOverlap(a.command.context, b.command.context)) continue;
      if (a.binding === b.binding || a.binding.startsWith(b.binding + " then ") || b.binding.startsWith(a.binding + " then ")) {
        errors.push({ commandId: a.command.id, otherId: b.command.id, platform, message: `Conflicts with ${b.command.label} in overlapping contexts (including sequence prefixes).` });
      }
    }
    for (const id of Object.keys({ ...preferences.overrides, ...preferences.platforms[platform] })) {
      if (!registry.some(item => item.id === id)) errors.push({ commandId: id, platform, message: "Unknown action. Update or reset this saved assignment." });
    }
  }
  return errors;
}
export function parsePreferences(value: unknown): KeyboardPreferences {
  if (value === null || value === undefined) return defaultPreferences();
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid shortcut preferences.");
  const input = value as Record<string, unknown>;
  if (input.version !== 1 || !Number.isInteger(input.registryVersion)) throw new Error("Unsupported shortcut preference version. Your saved settings have been retained.");
  const parseMap = (map: unknown): Record<string, string[]> => {
    if (!map || typeof map !== "object" || Array.isArray(map) || Object.keys(map).length > 200) throw new Error("Invalid binding assignments.");
    const result: Record<string, string[]> = {};
    for (const [id, bindings] of Object.entries(map)) {
      if (!Array.isArray(bindings) || bindings.length > 8 || bindings.some(binding => typeof binding !== "string" || binding.length > 100)) throw new Error("Invalid binding set.");
      result[id] = bindings as string[];
    }
    return result;
  };
  const overrides = parseMap(input.overrides);
  const platforms: KeyboardPreferences["platforms"] = {};
  if (!input.platforms || typeof input.platforms !== "object" || Array.isArray(input.platforms)) throw new Error("Invalid platform preferences.");
  for (const [platform, map] of Object.entries(input.platforms)) {
    if (!["mac", "windows", "linux"].includes(platform)) throw new Error("Unsupported platform.");
    platforms[platform as Platform] = parseMap(map);
  }
  const lastEffective: KeyboardPreferences["lastEffective"] = {};
  if (input.lastEffective && typeof input.lastEffective === "object") for (const platform of ["mac", "windows", "linux"] as const) {
    const map = (input.lastEffective as Record<string, unknown>)[platform];
    if (map) lastEffective[platform] = parseMap(map);
  }
  return { version: 1, registryVersion: input.registryVersion as number, overrides, platforms, lastEffective };
}
export function snapshotPreferences(preferences: KeyboardPreferences, registry = keyboardCommands): KeyboardPreferences {
  return { ...preferences, registryVersion: REGISTRY_VERSION, lastEffective: Object.fromEntries((["mac", "windows", "linux"] as const).map(platform => [platform, Object.fromEntries(registry.filter(item => !["excluded", "native", "disputed"].includes(item.availability)).map(item => [item.id, effectiveBindings(item.id, preferences, platform, registry)]))])) };
}
export function safePreferences(preferences: KeyboardPreferences, platform: Platform, registry = keyboardCommands): { preferences: KeyboardPreferences; errors: BindingError[] } {
  const errors = validatePreferences(preferences, registry);
  if (!errors.length) return { preferences, errors };
  // Retain the prior saved configuration, suppressing new conflicting defaults. Never replace user overrides.
  const previous = preferences.lastEffective?.[platform];
  const platforms = { ...preferences.platforms, [platform]: { ...preferences.platforms[platform] } };
  for (const item of registry) {
    if (previous) platforms[platform]![item.id] = previous[item.id] ?? [];
    else if (errors.some(error => error.platform === platform && (error.commandId === item.id || error.otherId === item.id))) platforms[platform]![item.id] = [];
  }
  return { preferences: { ...preferences, platforms }, errors };
}
export function suggestBinding(id: string, preferences: KeyboardPreferences, platform: Platform, registry = keyboardCommands): string | null {
  for (const binding of ["Alt+Shift+1", "Alt+Shift+2", "Alt+Shift+3", "Alt+Shift+4", "Alt+Shift+5", "Alt+Shift+6", "Alt+Shift+7", "Alt+Shift+8", "Alt+Shift+9"]) {
    const next = { ...preferences, platforms: { ...preferences.platforms, [platform]: { ...preferences.platforms[platform], [id]: [binding] } } };
    if (!validatePreferences(next, registry).some(error => error.platform === platform && (error.commandId === id || error.otherId === id))) return binding;
  }
  return null;
}
export interface KeyInput { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; repeat: boolean }
export function bindingFromEvent(event: KeyInput): string | null {
  if (["Meta", "Control", "Alt", "Shift", "Dead", "Process", "Unidentified"].includes(event.key)) return null;
  // Symbols already encode Shift in their produced character (e.g. ? and {).
  const shift = event.shiftKey && (event.key.length > 1 || /[a-z]/i.test(event.key));
  return normalizeBinding([event.metaKey && "Meta", event.ctrlKey && "Ctrl", event.altKey && "Alt", shift && "Shift", event.key === " " ? "Space" : event.key].filter(Boolean).join("+"));
}
export interface DispatchCommand { id: string; bindings: string[]; repeat?: boolean; allowInEditor?: boolean; allowInModal?: boolean; handle?: () => void | boolean }
export class KeyboardDispatcher {
  private prefix: string[] = []; private expiresAt = 0; private context = "";
  reset() { this.prefix = []; this.expiresAt = 0; }
  dispatch(event: KeyInput, commands: DispatchCommand[], context: string, now = Date.now(), environment: { typing?: boolean; modal?: boolean; composing?: boolean } = {}): { consumed: boolean; commandId?: string } {
    if (environment.composing) { this.reset(); return { consumed: false }; }
    commands = commands.filter(command => (!environment.typing || command.allowInEditor) && (!environment.modal || command.allowInModal));
    if (context !== this.context || now > this.expiresAt || event.key === "Escape") this.reset();
    this.context = context;
    const step = bindingFromEvent(event);
    if (!step) { this.reset(); return { consumed: false }; }
    const candidate = [...this.prefix, step].join(" then ");
    const exact = commands.filter(command => (!event.repeat || command.repeat) && command.bindings.some(binding => normalizeBinding(binding) === candidate));
    if (exact.length) {
      this.reset();
      for (const command of exact) {
        if (command.handle?.() !== false) return { consumed: true, commandId: command.id };
      }
      return { consumed: false };
    }
    if (!event.repeat && commands.some(command => command.bindings.some(binding => normalizeBinding(binding)?.startsWith(candidate + " then ")))) {
      this.prefix.push(step); this.expiresAt = now + 1000; return { consumed: true };
    }
    this.reset(); return { consumed: false };
  }
}
