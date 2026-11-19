import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, CalendarDays, CalendarClock, CalendarRange, Copy, Eye, EyeOff, Hash, Inbox, LineChart, ListFilter, Minus, Monitor, Moon, MoreHorizontal, Plus, RotateCcw, Search, Star, Sun, Target } from "lucide-react";
import { personalization, personalizationReads } from "./runtime";
import { theme } from "./theme";
import {
  applyDesign, defaultDesign, defaultPersonalization, designCode, fieldColor, fieldPoint, personalizationKeys, readDesignCode, sidebarOrder,
  type DesignDto, type DesignMode, type PersonalizationDto, type SidebarEntry,
} from "./personalization";
import { SortableRow, SortableTasks } from "./bulk-views";
import { Button, Hint, Input, SliderControl, ToggleGroup, ToggleGroupItem, cn } from "./ui";

// ---- The account's document ----------------------------------------------------

/** Saves wait for a pause (sliders and drags send many changes); the latest wins. */
const SAVE_DELAY = 600;

/**
 * The account's design and sidebar. Until the account saves one, the defaults with
 * this device's current mode, so nothing changes for people who never open the settings.
 * `update` shows the change at once and saves it after a short pause.
 */
export function usePersonalization(userId: string) {
  const cache = useQueryClient();
  const query = useQuery(personalizationReads.document(userId));
  const save = useMutation({ mutationFn: personalization.save, meta: { action: () => "save your design" } });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const document: PersonalizationDto = query.data ?? { ...defaultPersonalization, design: { ...defaultDesign, mode: theme.mode() } };
  const update = (next: PersonalizationDto) => {
    cache.setQueryData(personalizationKeys.document(userId), next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save.mutate(next), SAVE_DELAY);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return { document, loaded: query.status !== "pending", saved: query.data !== undefined && query.data !== null, update };
}

/**
 * In the shell: paints the account's design (and its mode) whenever it changes, and
 * keeps the mode in step when it changes elsewhere (the theme shortcut, the OS in System).
 */
export function PersonalizationSync({ userId }: { userId: string }) {
  const { document, loaded, saved, update } = usePersonalization(userId);
  const design = document.design;
  useEffect(() => {
    if (!loaded) return;
    if (saved && theme.mode() !== design.mode) theme.setMode(design.mode);
    applyDesign(design);
  }, [loaded, saved, design]);
  const latest = useRef({ document, saved, update });
  latest.current = { document, saved, update };
  useEffect(() => theme.subscribe(() => {
    const { document: current, saved: stored, update: write } = latest.current;
    // Light and dark have their own base colours: repaint the design on top of the new ones.
    applyDesign(current.design);
    if (stored && theme.mode() !== current.design.mode) write({ ...current, design: { ...current.design, mode: theme.mode() } });
  }), []);
  return null;
}

// ---- Settings › Appearance -----------------------------------------------------------

/** Ready-made designs: one click, then tune. */
const presets: { name: string; design: Omit<DesignDto, "mode"> }[] = [
  { name: "Todalo", design: { colors: ["#c9b8a6"], intensity: 0, grain: 0, accent: null } },
  { name: "Sage", design: { colors: ["#a8c3a0", "#d6e2c9"], intensity: 55, grain: 25, accent: "#4f7a55" } },
  { name: "Ocean", design: { colors: ["#7fb3d5", "#a9c9e8"], intensity: 55, grain: 15, accent: "#2f6fa6" } },
  { name: "Dusk", design: { colors: ["#b9a3d6", "#e3a6b8"], intensity: 60, grain: 30, accent: "#8a5cc2" } },
  { name: "Ember", design: { colors: ["#f0a873", "#e9757a"], intensity: 50, grain: 35, accent: "#d2552f" } },
  { name: "Sand", design: { colors: ["#e6d3b3"], intensity: 65, grain: 45, accent: "#9b6b35" } },
  { name: "Forest", design: { colors: ["#6f9a7a", "#3f6b5a"], intensity: 60, grain: 40, accent: "#3d7a57" } },
  { name: "Slate", design: { colors: ["#9aa5b4"], intensity: 45, grain: 20, accent: "#4a5a73" } },
];

const accents: { value: string | null; label: string; color: string }[] = [
  { value: null, label: "Todalo red", color: "#dc4c3e" },
  { value: "#e07a2f", label: "Orange", color: "#e07a2f" }, { value: "#c9a227", label: "Gold", color: "#c9a227" },
  { value: "#3d8b5a", label: "Green", color: "#3d8b5a" }, { value: "#2c8c8c", label: "Teal", color: "#2c8c8c" },
  { value: "#2f6fa6", label: "Blue", color: "#2f6fa6" }, { value: "#6a5acd", label: "Indigo", color: "#6a5acd" },
  { value: "#a04ab4", label: "Purple", color: "#a04ab4" }, { value: "#c2457a", label: "Pink", color: "#c2457a" },
  { value: "#505a66", label: "Graphite", color: "#505a66" },
];

const modes: { value: DesignMode; label: string; icon: ReactNode }[] = [
  { value: "system", label: "System", icon: <Monitor /> }, { value: "light", label: "Light", icon: <Sun /> }, { value: "dark", label: "Dark", icon: <Moon /> },
];

// The field's hues at mid depth, as gradient stops (no "longer hue" interpolation: older WebKit lacks it).
const hues = `linear-gradient(to right, ${Array.from({ length: 13 }, (_, i) => fieldColor(i / 12, 0.5)).join(", ")})`;

/** The colour field: a dot grid of hues (left to right) from pale (top) to deep (bottom); each colour is a handle. */
function ColorField({ colors, onChange }: { colors: string[]; onChange: (colors: string[]) => void }) {
  const field = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const pick = (event: ReactPointerEvent, index: number) => {
    const box = field.current!.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width, y = (event.clientY - box.top) / box.height;
    onChange(colors.map((color, i) => i === index ? fieldColor(x, y) : color));
  };
  const nudge = (index: number, dx: number, dy: number) => {
    const point = fieldPoint(colors[index]!);
    onChange(colors.map((color, i) => i === index ? fieldColor((point.x + dx + 1) % 1, point.y + dy) : color));
  };
  return <div ref={field} className="design-field" data-design-field="" style={{ "--design-hues": hues } as CSSProperties}
    onPointerDown={(event) => { if ((event.target as Element).closest("[data-design-handle]")) return; event.currentTarget.setPointerCapture(event.pointerId); setDragging(0); pick(event, 0); }}
    onPointerMove={(event) => { if (dragging !== null) pick(event, dragging); }}
    onPointerUp={() => setDragging(null)} onPointerCancel={() => setDragging(null)}>
    {colors.map((color, index) => { const point = fieldPoint(color); return <button key={index} type="button" data-design-handle={index}
      className="absolute -mt-[1.125rem] -ml-[1.125rem] size-9 cursor-grab rounded-full border-[3px] border-white shadow-[0_1px_6px_rgb(0_0_0/0.3)] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%`, background: color, zIndex: dragging === index ? 2 : 1 }}
      aria-label={`Colour ${index + 1} of ${colors.length}: ${color}. Arrow keys move it.`}
      onPointerDown={(event) => { event.stopPropagation(); field.current!.setPointerCapture(event.pointerId); setDragging(index); }}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 0.1 : 0.02;
        const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
        const move = moves[event.key];
        if (move) { event.preventDefault(); nudge(index, ...move); }
      }} />; })}
  </div>;
}

export function AppearanceSettingsScreen({ userId }: { userId: string }) {
  const { document, update } = usePersonalization(userId);
  const design = document.design;
  const [code, setCode] = useState("");
  const [shared, setShared] = useState<string | null>(null);
  const set = (change: Partial<DesignDto>) => update({ ...document, design: { ...design, ...change } });
  const intensityHint = design.intensity === 0 ? "Off: the plain Todalo look." : "How much of your colours shows in the sidebar and page.";
  return <div className="ui flex flex-col gap-6" data-appearance-settings="">
    <section className="flex flex-col gap-3" aria-labelledby="design-mode">
      <h3 id="design-mode" className="text-sm font-semibold">Mode</h3>
      <ToggleGroup aria-labelledby="design-mode" variant="outline" value={[design.mode]} onValueChange={(next) => { const mode = next[0] as DesignMode | undefined; if (mode) set({ mode }); }}>
        {modes.map(mode => <ToggleGroupItem key={mode.value} value={mode.value} className="gap-1.5 px-3">{mode.icon}{mode.label}</ToggleGroupItem>)}
      </ToggleGroup>
    </section>

    <section className="flex flex-col gap-3" aria-labelledby="design-colors">
      <div className="flex items-center justify-between gap-2">
        <h3 id="design-colors" className="text-sm font-semibold">Colours</h3>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove a colour" disabled={design.colors.length <= 1}
            onClick={() => set({ colors: design.colors.slice(0, -1) })}><Minus /></Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Add a colour (a gradient)" disabled={design.colors.length >= 3}
            onClick={() => { const last = fieldPoint(design.colors.at(-1)!); set({ colors: [...design.colors, fieldColor((last.x + 0.12) % 1, last.y)], intensity: design.intensity || 50 }); }}><Plus /></Button>
        </div>
      </div>
      <ColorField colors={design.colors} onChange={(colors) => set({ colors, intensity: design.intensity || 50 })} />
      <div className="flex flex-wrap gap-2" role="group" aria-label="Ready-made designs">
        {presets.map(preset => <button key={preset.name} type="button" className="group grid cursor-pointer justify-items-center gap-1 rounded-lg p-1 text-muted-foreground data-active:text-foreground" title={preset.name} aria-label={`Use ${preset.name}`}
          data-active={JSON.stringify({ ...design, mode: undefined }) === JSON.stringify({ ...preset.design, mode: undefined }) || undefined}
          onClick={() => set(preset.design)}>
          <span className="block size-11 rounded-[0.625rem] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--color-foreground)_12%,transparent)] group-data-active:ring-2 group-data-active:ring-foreground group-data-active:ring-offset-2 group-data-active:ring-offset-background" style={{ background: preset.design.colors.length > 1 ? `linear-gradient(135deg, ${preset.design.colors.join(", ")})` : preset.design.colors[0] }} />
          <span className="text-xs">{preset.name}</span>
        </button>)}
      </div>
    </section>

    <section className="flex flex-col gap-4" aria-label="Intensity and grain">
      <div><SliderControl name="Intensity" value={design.intensity} min={0} max={100} step={1} unit="%" onValueChange={(intensity: number) => set({ intensity })} />
        <Hint className="mt-1">{intensityHint}</Hint></div>
      <div><SliderControl name="Grain" value={design.grain} min={0} max={100} step={1} unit="%" onValueChange={(grain: number) => set({ grain })} />
        <Hint className="mt-1">A film-like texture on the sidebar.</Hint></div>
    </section>

    <section className="flex flex-col gap-3" aria-labelledby="design-accent">
      <h3 id="design-accent" className="text-sm font-semibold">Accent</h3>
      <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-labelledby="design-accent">
        {accents.map(accent => <button key={accent.label} type="button" role="radio" aria-checked={design.accent === accent.value} aria-label={accent.label} title={accent.label}
          className="relative block size-7 cursor-pointer rounded-full aria-checked:ring-2 aria-checked:ring-foreground aria-checked:ring-offset-2 aria-checked:ring-offset-background" style={{ background: accent.color }} onClick={() => set({ accent: accent.value })} />)}
        <label className="relative block size-7 cursor-pointer rounded-full aria-checked:ring-2 aria-checked:ring-foreground aria-checked:ring-offset-2 aria-checked:ring-offset-background overflow-hidden bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)]" title="Any colour" aria-checked={design.accent !== null && !accents.some(accent => accent.value === design.accent)} role="radio">
          <input type="color" className="absolute inset-0 size-full cursor-pointer opacity-0" aria-label="Any accent colour" value={design.accent ?? "#dc4c3e"} onChange={(event) => set({ accent: event.target.value })} />
        </label>
      </div>
      <Hint>Buttons, links, the selected item and today's date.</Hint>
    </section>

    <section className="flex flex-col gap-3 border-t border-border-subtle pt-5" aria-labelledby="design-share">
      <h3 id="design-share" className="text-sm font-semibold">Share</h3>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => { void navigator.clipboard?.writeText(designCode(design)).then(() => setShared("Design code copied."), () => setShared("Could not copy. Select the code instead.")); }}><Copy />Copy design code</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => update({ ...document, design: { ...defaultDesign, mode: design.mode } })}><RotateCcw />Reset</Button>
      </div>
      <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); const pasted = readDesignCode(code); if (!pasted) { setShared("That isn't a Todalo design code."); return; } update({ ...document, design: pasted }); setCode(""); setShared("Design applied."); }}>
        <Input aria-label="Paste a design code" placeholder="Paste a design code" value={code} onChange={(event) => setCode(event.target.value)} className="max-w-sm" />
        <Button type="submit" variant="outline" size="sm" disabled={!code.trim()}>Apply</Button>
      </form>
      {shared && <Hint role="status">{shared}</Hint>}
    </section>
  </div>;
}

// ---- Settings › Sidebar --------------------------------------------------------------

export const sidebarLabels: Record<SidebarEntry, { label: string; icon: ReactNode; hint?: string }> = {
  rituals: { label: "Due rituals", icon: <CalendarCheck />, hint: "Only while one is due" },
  season: { label: "Season", icon: <CalendarRange /> },
  goals: { label: "Goals", icon: <Target /> },
  search: { label: "Search", icon: <Search /> },
  inbox: { label: "Inbox", icon: <Inbox /> },
  today: { label: "Today", icon: <CalendarClock /> },
  upcoming: { label: "Upcoming", icon: <CalendarDays /> },
  filters: { label: "Filters & Labels", icon: <ListFilter /> },
  reporting: { label: "Reporting", icon: <LineChart /> },
  more: { label: "More", icon: <MoreHorizontal /> },
  favorites: { label: "Favorites", icon: <Star />, hint: "When you have favourites" },
  projects: { label: "My Projects", icon: <Hash /> },
};

export function SidebarSettingsScreen({ userId }: { userId: string }) {
  const { document, update } = usePersonalization(userId);
  const order = sidebarOrder(document.sidebar);
  const hidden = new Set(document.sidebar.hidden);
  const setSidebar = (next: { order?: SidebarEntry[]; hidden?: SidebarEntry[] }) => update({ ...document, sidebar: { order: next.order ?? order, hidden: next.hidden ?? [...hidden] } });
  const move = (id: SidebarEntry, overId: SidebarEntry, position: "before" | "after") => {
    const without = order.filter(item => item !== id);
    const at = without.indexOf(overId) + (position === "after" ? 1 : 0);
    setSidebar({ order: [...without.slice(0, at), id, ...without.slice(at)] });
  };
  return <div className="ui flex flex-col gap-4" data-sidebar-settings="">
    <Hint>Choose what the sidebar shows, and drag to reorder. Views next to each other share one list; Season, Goals, Favorites and My Projects each keep their heading.</Hint>
    <SortableTasks ids={order} label={(id) => sidebarLabels[id as SidebarEntry].label} onReorder={(id, overId, position) => move(id as SidebarEntry, overId as SidebarEntry, position)}>
      <ul className="flex flex-col" aria-label="Sidebar entries">{order.map(id => { const entry = sidebarLabels[id]; const shown = !hidden.has(id); return <li key={id}>
        <SortableRow id={id} title={entry.label} className="sidebar-setting group/row" handleClassName="inline-grid size-6 cursor-grab place-items-center text-muted-foreground [&_svg]:size-4">
          <span className={cn("flex min-w-0 flex-1 items-center gap-2.5 [&_svg]:size-4 [&_svg]:text-subtle-foreground", !shown && "text-muted-foreground")}>
            {entry.icon}<span className="truncate">{entry.label}</span>{entry.hint && <span className="text-xs text-subtle-foreground">{entry.hint}</span>}
          </span>
          <Button type="button" variant="ghost" size="sm" aria-pressed={shown} data-sidebar-toggle={id}
            aria-label={`${shown ? "Hide" : "Show"} ${entry.label}`} onClick={() => setSidebar({ hidden: shown ? [...hidden, id] : [...hidden].filter(item => item !== id) })}>
            {shown ? <Eye /> : <EyeOff />}{shown ? "Shown" : "Hidden"}
          </Button>
        </SortableRow>
      </li>; })}</ul>
    </SortableTasks>
    <div><Button type="button" variant="ghost" size="sm" onClick={() => setSidebar({ order: [...defaultPersonalization.sidebar.order], hidden: [] })}><RotateCcw />Reset to default</Button></div>
  </div>;
}

/** The sidebar's entries: Search pinned first (right under Add task), then the account's order without hidden ones (shell.tsx renders them). */
export function useSidebarLayout(userId: string): SidebarEntry[] {
  const { document } = usePersonalization(userId);
  const hidden = new Set(document.sidebar.hidden);
  return ["search", ...sidebarOrder(document.sidebar).filter(entry => !hidden.has(entry))];
}
