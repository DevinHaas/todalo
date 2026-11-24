import { useEffect, useMemo, useRef, useState, type ComponentProps, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, CalendarDays, CalendarClock, CalendarRange, ChevronDown, Copy, Eye, EyeOff, FileUp, Hash, Image as ImageIcon, ImagePlus, Inbox, LineChart, ListFilter, Minus, Monitor, Moon, MoreHorizontal, Palette, Plus, RotateCcw, Search, Sparkles, Star, Sun, Target, Trash2, X } from "lucide-react";
import { personalization, personalizationReads } from "./runtime";
import { theme } from "./theme";
import {
  CUSTOM_CSS_MAX_LENGTH, applyDesign, applyWallpaper, defaultDesign, defaultPersonalization, designCode, fieldColor, fieldPoint, grainStrength, personalizationKeys, readDesignCode, sidebarOrder, wallpaperFromFile,
  type DesignBackground, type DesignBorders, type DesignCorners, type DesignDto, type DesignFont, type DesignMode, type PersonalizationDto, type SidebarEntry,
} from "./personalization";
import { SAFE_MODE, TOGGLE_CUSTOM_CSS_EVENT, applyCustomCss, sanitizeCss } from "./custom-css";
import { customCssPrompt } from "./theme-reference";
import { helpLink } from "./help";
import { toasts } from "./toasts";
import { SortableRow, SortableTasks } from "./bulk-views";
import { Badge, Button, Hint, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SliderControl, SwatchPicker, Switch, Tabs, TabsContent, TabsList, TabsTrigger, Textarea, ToggleGroup, ToggleGroupItem, cn, type Swatch } from "./ui";

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
    // A read still in flight would land on top of this change (and the next edit would save its stale copy).
    void cache.cancelQueries({ queryKey: personalizationKeys.document(userId) });
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
  // By value: without a saved design the fallback is a new object each render, and repainting
  // the root's variables forces a style recalc of the whole page.
  const designKey = JSON.stringify(design);
  useEffect(() => {
    if (!loaded) return;
    if (saved && theme.mode() !== design.mode) theme.setMode(design.mode);
    applyDesign(design);
  }, [loaded, saved, designKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // Only the image background shows the picture (the colours one keeps it stored, not painted).
  const wallpaper = design.background === "image" ? document.wallpaper : null;
  useEffect(() => { if (loaded) applyWallpaper(wallpaper); }, [loaded, wallpaper]);
  const customCss = document.customCss;
  useEffect(() => { if (loaded) applyCustomCss(customCss); }, [loaded, customCss]);
  const latest = useRef({ document, loaded, saved, update });
  latest.current = { document, loaded, saved, update };
  useEffect(() => { if (SAFE_MODE) toasts.add({ title: "Safe mode", description: "Custom CSS is off for this visit. Reload without ?safe to use it again." }); }, []);
  // The keyboard command (keyboard-screens.tsx): custom CSS off or on, saved like the settings switch.
  useEffect(() => {
    const toggle = () => {
      const { document: current, loaded: ready, update: write } = latest.current;
      if (!ready) return;
      if (!current.customCss) return void toasts.add({ title: "No custom CSS", description: "Add one in Settings › Appearance › Custom CSS." });
      const enabled = !current.customCss.enabled;
      write({ ...current, customCss: { ...current.customCss, enabled } });
      toasts.add({ title: enabled ? "Custom CSS on" : "Custom CSS off", description: enabled && SAFE_MODE ? "Safe mode: it shows after a reload without ?safe." : undefined });
    };
    window.addEventListener(TOGGLE_CUSTOM_CSS_EVENT, toggle);
    return () => window.removeEventListener(TOGGLE_CUSTOM_CSS_EVENT, toggle);
  }, []);
  useEffect(() => theme.subscribe(() => {
    const { document: current, saved: stored, update: write } = latest.current;
    // Light and dark have their own base colours: repaint the design on top of the new ones.
    applyDesign(current.design);
    if (stored && theme.mode() !== current.design.mode) write({ ...current, design: { ...current.design, mode: theme.mode() } });
  }), []);
  return null;
}

// ---- Settings › Appearance -----------------------------------------------------------

/** A design without its mode: what a preset sets (the device keeps its mode). */
type Look = Omit<DesignDto, "mode">;
const lookKeys = (Object.keys(defaultDesign) as (keyof DesignDto)[]).filter((key): key is keyof Look => key !== "mode");
const plain = Object.fromEntries(lookKeys.map(key => [key, defaultDesign[key]])) as Look;
/** A whole look: anything a preset leaves out is the default (today's font, corners, borders, no glass). */
const look = (design: Partial<Look>): Look => ({ ...plain, ...design });

/** Ready-made designs: one click, then tune. */
const presets: { name: string; design: Look }[] = [
  { name: "Todalo", design: look({}) },
  { name: "Sage", design: look({ colors: ["#a8c3a0", "#d6e2c9"], intensity: 55, grain: 25, accent: "#4f7a55" }) },
  { name: "Ocean", design: look({ colors: ["#7fb3d5", "#a9c9e8"], intensity: 55, grain: 15, accent: "#2f6fa6" }) },
  { name: "Dusk", design: look({ colors: ["#b9a3d6", "#e3a6b8"], intensity: 60, grain: 30, accent: "#8a5cc2" }) },
  { name: "Ember", design: look({ colors: ["#f0a873", "#e9757a"], intensity: 50, grain: 35, accent: "#d2552f" }) },
  { name: "Sand", design: look({ colors: ["#e6d3b3"], intensity: 65, grain: 45, accent: "#9b6b35" }) },
  { name: "Forest", design: look({ colors: ["#6f9a7a", "#3f6b5a"], intensity: 60, grain: 40, accent: "#3d7a57" }) },
  { name: "Slate", design: look({ colors: ["#9aa5b4"], intensity: 45, grain: 20, accent: "#4a5a73" }) },
  // Riced-desktop looks: monospace, lined panels and glass over the colours (or a wallpaper).
  { name: "Terminal", design: look({ colors: ["#b3a679", "#6f6448"], intensity: 60, grain: 15, accent: "#6b5c1f", font: "jetbrains-mono", corners: "sharp", borders: "strong", borderColor: "#8f8458", glass: 50 }) },
  { name: "Harbor", design: look({ colors: ["#5d6b85", "#8fa9c4"], intensity: 55, accent: "#4f7cac", font: "plex-mono", borders: "subtle", borderColor: "#7f98b5", glass: 45 }) },
];

const sameDesign = (a: Look, b: Look) => lookKeys.every(key => JSON.stringify(a[key]) === JSON.stringify(b[key]));

/** Todalo's own red: no accent (`accent: null`). */
const TODALO_ACCENT = "todalo";
const accents: Swatch<string>[] = [
  { value: TODALO_ACCENT, label: "Todalo red", color: "#dc4c3e" },
  { value: "#e07a2f", label: "Orange", color: "#e07a2f" }, { value: "#c9a227", label: "Gold", color: "#c9a227" },
  { value: "#3d8b5a", label: "Green", color: "#3d8b5a" }, { value: "#2c8c8c", label: "Teal", color: "#2c8c8c" },
  { value: "#2f6fa6", label: "Blue", color: "#2f6fa6" }, { value: "#6a5acd", label: "Indigo", color: "#6a5acd" },
  { value: "#a04ab4", label: "Purple", color: "#a04ab4" }, { value: "#c2457a", label: "Pink", color: "#c2457a" },
  { value: "#505a66", label: "Graphite", color: "#505a66" },
];

const modes: { value: DesignMode; label: string; icon: ReactNode }[] = [
  { value: "system", label: "System", icon: <Monitor /> }, { value: "light", label: "Light", icon: <Sun /> }, { value: "dark", label: "Dark", icon: <Moon /> },
];

// Names only, never previews in each font: showing them would download every font's files.
const fonts: { value: DesignFont; label: string }[] = [
  { value: "system", label: "System" }, { value: "geist", label: "Geist" }, { value: "serif", label: "Source Serif" },
  { value: "jetbrains-mono", label: "JetBrains Mono" }, { value: "plex-mono", label: "IBM Plex Mono" },
];
const backgrounds: { value: DesignBackground; label: string; icon: ReactNode }[] = [{ value: "color", label: "Colour", icon: <Palette /> }, { value: "image", label: "Image", icon: <ImageIcon /> }];
const cornerOptions: { value: DesignCorners; label: string }[] = [{ value: "sharp", label: "Sharp" }, { value: "soft", label: "Soft" }, { value: "round", label: "Round" }];
const borderOptions: { value: DesignBorders; label: string }[] = [{ value: "none", label: "None" }, { value: "subtle", label: "Subtle" }, { value: "strong", label: "Strong" }];

/** Glass's track: a checkerboard (see-through) that shows more of itself towards 100. */
const glassTrack = "linear-gradient(to right, var(--color-muted), transparent), repeating-conic-gradient(var(--color-border-hover) 0 25%, transparent 0 50%) 0 0 / 8px 8px";

// The field's hues at mid depth, as gradient stops (no "longer hue" interpolation: older WebKit lacks it).
const hues = `linear-gradient(to right, ${Array.from({ length: 13 }, (_, i) => fieldColor(i / 12, 0.5)).join(", ")})`;

/**
 * Grain's track: specks that thicken from none (left) to full grain (right) along the grain's own
 * strength curve (grainStrength), so the strip reads like the texture it sets. A fixed
 * seed, so they never jump between renders. x and y are 0-1 across the track, r in px.
 */
export const grainSpecks = (() => {
  let seed = 42;
  const random = () => (seed = seed * 16807 % 2147483647) / 2147483647;
  return Array.from({ length: 420 }, () => ({ x: random(), y: random(), r: 0.8 + random() * 0.6, keep: random() }))
    .filter(speck => speck.keep < grainStrength(speck.x * 100));
})();

/** The specks up to the value are inked: the track's fill. */
function GrainTrack({ value }: { value: number }) {
  return <svg className="size-full" data-grain-track="">
    {grainSpecks.map((speck, i) => <circle key={i} cx={`${speck.x * 100}%`} cy={`${18 + speck.y * 64}%`} r={speck.r}
      className={speck.x * 100 <= value ? "fill-foreground/85" : "fill-muted-foreground/60"} />)}
  </svg>;
}

/**
 * A slider whose track pictures what it sets. The picture is decoration (hidden from
 * screen readers); the slider keeps its own name, value and keys.
 */
function PictureSlider({ picture, ...props }: { picture: ReactNode } & ComponentProps<typeof SliderControl>) {
  return <div className="relative isolate">
    {/* ponytail: sits under the slider's 18px control (h-4, 1px up = same centre); follow the primitive if it changes height. */}
    <div aria-hidden="true" className="absolute inset-x-0 bottom-px -z-10 h-4 overflow-hidden rounded-full bg-muted">{picture}</div>
    <SliderControl {...props} className="[&_[data-slot=slider-dot]]:ring-2 [&_[data-slot=slider-dot]]:ring-background [&_[data-slot=slider-range]]:hidden [&_[data-slot=slider-track]]:bg-transparent" />
  </div>;
}

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
      className="absolute size-7 -translate-1/2 cursor-grab rounded-full border-[3px] border-white shadow-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-muted" style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%`, background: color, zIndex: dragging === index ? 2 : 1 }}
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
  const { document, loaded, update } = usePersonalization(userId);
  const design = document.design;
  const [code, setCode] = useState("");
  const [shared, setShared] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [preparing, setPreparing] = useState(false);
  const [wallpaperNote, setWallpaperNote] = useState<string | null>(null);
  const set = (change: Partial<DesignDto>) => update({ ...document, design: { ...design, ...change } });
  const chooseWallpaper = async (file: File | undefined) => {
    if (!file) return;
    setPreparing(true);
    setWallpaperNote(null);
    try {
      const wallpaper = await wallpaperFromFile(file);
      // A wallpaper only shows through glass: turn some on rather than hide the new picture.
      // A new picture is what the user wants to see: the image background, with some glass to see it through.
      update({ ...document, wallpaper, design: { ...design, background: "image", glass: design.glass || 40 } });
    } catch { setWallpaperNote("That image couldn't be used. Try a JPEG, PNG or WebP."); }
    finally { setPreparing(false); }
  };
  const preset = presets.find(preset => sameDesign(preset.design, design));
  const accent = design.accent ?? TODALO_ACCENT;
  const customAccent = !accents.some(swatch => swatch.value === accent);
  const label = "text-xs-plus font-semibold";
  const image = design.background === "image";
  // Editing before the saved document arrives would save the defaults over it (wallpaper included).
  if (!loaded) return null;
  return <div className="ui flex flex-col gap-5" data-appearance-settings="">
    <section className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5" aria-labelledby="design-mode">
      <h3 id="design-mode" className={label}>Mode</h3>
      <ToggleGroup aria-labelledby="design-mode" variant="outline" value={[design.mode]} onValueChange={(next) => { const mode = next[0] as DesignMode | undefined; if (mode) set({ mode }); }}>
        {modes.map(mode => <ToggleGroupItem key={mode.value} value={mode.value} className="gap-1.5 px-2.5">{mode.icon}{mode.label}</ToggleGroupItem>)}
      </ToggleGroup>
    </section>

    <section className="flex flex-col gap-3 rounded-xl border border-border-subtle p-3" aria-labelledby="design-background" data-design-background="">
      <div className="-mb-1 flex min-h-7 items-center justify-between gap-2">
        <h3 id="design-background" className={label}>Background</h3>
        {image ? <div className="flex items-center">
          {document.wallpaper && <Button type="button" variant="ghost" size="sm" disabled={preparing} onClick={() => picker.current?.click()}><ImagePlus />{preparing ? "Preparing…" : "Replace"}</Button>}
          {document.wallpaper && <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove the wallpaper" onClick={() => update({ ...document, wallpaper: null })}><X /></Button>}
        </div> : <div className="flex items-center">
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove a colour" disabled={design.colors.length <= 1}
            onClick={() => set({ colors: design.colors.slice(0, -1) })}><Minus /></Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Add a colour (a gradient)" disabled={design.colors.length >= 3}
            onClick={() => { const last = fieldPoint(design.colors.at(-1)!); set({ colors: [...design.colors, fieldColor((last.x + 0.12) % 1, last.y)], intensity: design.intensity || 50 }); }}><Plus /></Button>
        </div>}
        <input ref={picker} type="file" accept="image/*" hidden
          onChange={(event) => { void chooseWallpaper(event.target.files?.[0]); event.target.value = ""; }} />
      </div>
      {/* One backdrop at a time: the tabs switch it (both stay stored), only the active one renders in the app. */}
      <Tabs value={design.background} className="relative gap-3"
        onValueChange={(next) => { const background = next as DesignBackground; set({ background, ...(background === "image" && document.wallpaper && !design.glass && { glass: 40 }) }); }}>
        <TabsList aria-label="Background" className="absolute top-2 left-1/2 z-10 h-auto -translate-x-1/2 gap-0.5 rounded-full bg-[color-mix(in_oklch,var(--color-popover)_82%,transparent)] p-0.5 shadow-sm backdrop-blur-sm">
          {backgrounds.map(item => <TabsTrigger key={item.value} value={item.value} data-design-background-tab={item.value}
            className="h-6 flex-none rounded-full border-transparent px-2.5 data-active:border-transparent data-active:bg-[color-mix(in_oklch,var(--color-foreground)_12%,transparent)]">{item.icon}{item.label}</TabsTrigger>)}
        </TabsList>
        <TabsContent value="color" className="flex flex-col gap-3">
          <ColorField colors={design.colors} onChange={(colors) => set({ colors, intensity: design.intensity || 50 })} />
          <div className="flex items-center gap-3">
            {/* ponytail: ten presets scroll sideways in the narrowest pane (w-0: they never widen it). Sharp-cornered looks get square swatches. */}
            <div className="-m-1 flex w-0 min-w-0 flex-1 gap-2 overflow-x-auto p-1" role="group" aria-label="Ready-made designs">
              {presets.map(item => <button key={item.name} type="button" title={item.name} aria-label={`Use ${item.name}`} aria-pressed={item === preset}
                className={cn("size-6 shrink-0 cursor-pointer shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--color-foreground)_14%,transparent)] outline-none transition-shadow hover:ring-2 hover:ring-border-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-pressed:ring-2 aria-pressed:ring-foreground aria-pressed:ring-offset-2 aria-pressed:ring-offset-background",
                  item.design.corners === "sharp" ? "rounded-[3px]" : "rounded-full")}
                style={{ background: item.design.colors.length > 1 ? `linear-gradient(135deg, ${item.design.colors.join(", ")})` : item.design.colors[0] }}
                onClick={() => set(item.design)} />)}
            </div>
            <span className="ml-auto shrink-0 text-xs text-muted-foreground" aria-hidden="true">{preset?.name ?? "Custom"}</span>
          </div>
          <PictureSlider name="Intensity" value={design.intensity} valueLabel={design.intensity === 0 ? "Off" : undefined} min={0} max={100} step={1} unit="%"
            onValueChange={(intensity: number) => set({ intensity })}
            picture={<div className="size-full" style={{ background: `linear-gradient(to right, transparent, ${design.colors.join(", ")})` }} />} />
        </TabsContent>
        <TabsContent value="image">
          {document.wallpaper
            ? <div aria-hidden="true" className="h-34 rounded-[calc(.625rem*var(--design-corners,1))] bg-muted bg-cover bg-center" data-wallpaper-preview="" style={{ backgroundImage: `url("${document.wallpaper}")` }} />
            : <button type="button" className="flex h-34 w-full cursor-pointer rounded-[calc(.625rem*var(--design-corners,1))] bg-muted flex-col items-center justify-center gap-1 pt-6 text-xs-plus text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-5"
              disabled={preparing} onClick={() => picker.current?.click()}><ImagePlus />{preparing ? "Preparing…" : "Choose an image"}</button>}
        </TabsContent>
      </Tabs>
      <PictureSlider name="Grain" value={design.grain} valueLabel={design.grain === 0 ? "Off" : undefined} min={0} max={100} step={1} unit="%"
        onValueChange={(grain: number) => set({ grain })} picture={<GrainTrack value={design.grain} />} />
      <PictureSlider name="Glass" value={design.glass} valueLabel={design.glass === 0 ? "Off" : undefined} min={0} max={100} step={1} unit="%"
        onValueChange={(glass: number) => set({ glass })} picture={<div className="size-full" style={{ background: glassTrack }} />} />
      <Hint role="status">{wallpaperNote ?? (!image ? "Intensity tints the sidebar and page; glass lets the colours show through the panels."
        : !document.wallpaper ? "Choose a picture to show behind the app."
        : design.glass === 0 ? "Raise glass to see your wallpaper."
        : "Glass lets your wallpaper show through the sidebar, page and dialogs.")}</Hint>
    </section>

    <section className="flex flex-col gap-2" aria-labelledby="design-accent">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="design-accent" className={label}>Accent</h3>
        <Hint className="truncate">Buttons, links, selection and today</Hint>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <SwatchPicker aria-labelledby="design-accent" swatches={accents} value={customAccent ? "" : accent} onValueChange={(next) => set({ accent: next === TODALO_ACCENT ? null : next })} />
        <label title="Any colour" data-active={customAccent || undefined}
          className="relative block size-6 cursor-pointer rounded-full bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)] focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background data-active:ring-2 data-active:ring-foreground data-active:ring-offset-2 data-active:ring-offset-background">
          <input type="color" className="absolute inset-0 size-full cursor-pointer rounded-full opacity-0" aria-label="Any accent colour" value={design.accent ?? "#dc4c3e"} onChange={(event) => set({ accent: event.target.value })} />
        </label>
      </div>
    </section>

    <section className="flex flex-col gap-2" aria-labelledby="design-style">
      <h3 id="design-style" className={label}>Style</h3>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <span id="design-font" className="text-sm">Font</span>
        <Select items={fonts} value={design.font} onValueChange={(font) => { if (font) set({ font: font as DesignFont }); }}>
          <SelectTrigger size="sm" aria-labelledby="design-font" className="w-40" data-design-font=""><SelectValue /></SelectTrigger>
          <SelectContent>{fonts.map(font => <SelectItem key={font.value} value={font.value}>{font.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <span id="design-corners" className="text-sm">Corners</span>
        <ToggleGroup aria-labelledby="design-corners" variant="outline" value={[design.corners]} onValueChange={(next) => { const corners = next[0] as DesignCorners | undefined; if (corners) set({ corners }); }}>
          {cornerOptions.map(option => <ToggleGroupItem key={option.value} value={option.value} className="px-2.5">{option.label}</ToggleGroupItem>)}
        </ToggleGroup>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <span id="design-borders" className="text-sm">Borders</span>
        <div className="flex items-center gap-2">
          {design.borderColor && <Button type="button" variant="ghost" size="icon-sm" aria-label="Use the theme's border colour" onClick={() => set({ borderColor: null })}><X /></Button>}
          <label title="Border colour" className="relative block size-6 shrink-0 cursor-pointer rounded-full shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--color-foreground)_14%,transparent)] focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background"
            style={{ background: design.borderColor ?? "conic-gradient(var(--color-border-strong) 0 50%, var(--color-border) 0)" }}>
            {/* Picking a colour with borders off turns subtle ones on, so the colour shows. */}
            <input type="color" className="absolute inset-0 size-full cursor-pointer rounded-full opacity-0" aria-label="Border colour" value={design.borderColor ?? "#808080"}
              onChange={(event) => set({ borderColor: event.target.value, borders: design.borders === "none" ? "subtle" : design.borders })} />
          </label>
          <ToggleGroup aria-labelledby="design-borders" variant="outline" value={[design.borders]} onValueChange={(next) => { const borders = next[0] as DesignBorders | undefined; if (borders) set({ borders }); }}>
            {borderOptions.map(option => <ToggleGroupItem key={option.value} value={option.value} className="px-2.5">{option.label}</ToggleGroupItem>)}
          </ToggleGroup>
        </div>
      </div>
    </section>

    <section className="flex flex-col gap-2 border-t border-border-subtle pt-4" aria-labelledby="design-share">
      <div className="flex items-center justify-between gap-3">
        <h3 id="design-share" className={label}>Design code</h3>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={() => { void navigator.clipboard?.writeText(designCode(design)).then(() => setShared("Design code copied."), () => setShared("Could not copy. Select the code instead.")); }}><Copy />Copy</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => update({ ...document, design: { ...defaultDesign, mode: design.mode } })}><RotateCcw />Reset</Button>
        </div>
      </div>
      <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); const pasted = readDesignCode(code); if (!pasted) { setShared("That isn't a Todalo design code."); return; } update({ ...document, design: pasted }); setCode(""); setShared("Design applied."); }}>
        <Input aria-label="Paste a design code" placeholder="Paste a design code" value={code} onChange={(event) => setCode(event.target.value)} />
        <Button type="submit" variant="outline" disabled={!code.trim()}>Apply</Button>
      </form>
      {shared && <Hint role="status">{shared}</Hint>}
    </section>

    <CustomCssSection document={document} update={update} />
  </div>;
}

/**
 * Appearance › Custom CSS (advanced, collapsed until there is some): a stylesheet of the
 * account's own, pasted or uploaded, applied over the design (custom-css.ts). The switch is
 * the settings' way to turn it off; ?safe and the keyboard toggle work when a theme hides it.
 */
function CustomCssSection({ document, update }: { document: PersonalizationDto; update: (next: PersonalizationDto) => void }) {
  const custom = document.customCss;
  const [open] = useState(custom !== null);
  const [note, setNote] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const setCss = (css: string, enabled = custom?.enabled ?? true) => update({ ...document, customCss: css ? { css, enabled } : null });
  const removed = useMemo(() => custom ? sanitizeCss(custom.css).removed : 0, [custom]);
  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (!/\.css$/i.test(file.name) && file.type !== "text/css") return setNote("Choose a .css file.");
    if (file.size > CUSTOM_CSS_MAX_LENGTH) return setNote("That file is over 64 KB.");
    try { setCss(await file.text(), true); setNote(null); } catch { setNote("That file couldn't be read."); }
  };
  const copyPrompt = () => void navigator.clipboard?.writeText(customCssPrompt()).then(
    () => toasts.add({ title: "Prompt copied", description: "Paste it into any AI assistant, then describe your theme." }),
    () => toasts.add({ title: "Couldn't copy the prompt", description: "Your browser blocked the clipboard. Try again." }));
  const hint = SAFE_MODE && custom?.enabled ? "Safe mode: custom CSS is off for this visit."
    : note ?? (removed ? `${removed === 1 ? "One part was" : `${removed} parts were`} left out: only data: URLs load, and no @import.`
      : <>Applied over the design above; only data: URLs load. Stuck? Open todalo with <span className="whitespace-nowrap">?safe</span> in the address.</>);
  return <section className="border-t border-border-subtle pt-4" aria-labelledby="design-custom-css" data-custom-css-settings="">
    <details open={open} className="group/advanced">
      <summary className="-m-1 flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg p-1 outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2"><h3 id="design-custom-css" className="text-xs-plus font-semibold">Custom CSS</h3><Badge variant="outline">Advanced</Badge></span>
        <ChevronDown aria-hidden="true" className="size-4 text-muted-foreground transition-transform group-open/advanced:rotate-180" />
      </summary>
      <div className="mt-3 flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <Label className="flex cursor-pointer items-center gap-2 font-normal">
            <Switch checked={Boolean(custom?.enabled)} disabled={!custom} onCheckedChange={(enabled) => { if (custom) update({ ...document, customCss: { ...custom, enabled } }); }} data-custom-css-switch="" />
            Use custom CSS
          </Label>
          <div className="flex items-center">
            <Button type="button" variant="ghost" size="sm" onClick={() => picker.current?.click()}><FileUp />Upload .css</Button>
            <Button type="button" variant="ghost" size="sm" onClick={copyPrompt}><Sparkles />Copy prompt</Button>
          </div>
          <input ref={picker} type="file" accept=".css,text/css" hidden onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = ""; }} />
        </div>
        <Textarea aria-label="Custom CSS" spellCheck={false} autoCapitalize="off" autoCorrect="off" rows={5} maxLength={CUSTOM_CSS_MAX_LENGTH}
          className="field-sizing-fixed max-h-64 resize-y font-mono text-xs/relaxed" placeholder={"/* Paste or upload CSS, for example: */\n:root { --color-brand: #2f6fa6; }\n:root.dark { --color-brand: #7fb3d5; }"}
          value={custom?.css ?? ""} onChange={(event) => setCss(event.target.value)} data-custom-css-editor="" />
        <div className="flex items-start justify-between gap-3">
          <Hint role="status">{hint}</Hint>
          {custom && <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={() => { update({ ...document, customCss: null }); setNote(null); }}><Trash2 />Remove</Button>}
        </div>
        <a {...helpLink("custom-css")} className="w-fit text-xs-plus text-link hover:underline">How custom CSS works</a>
      </div>
    </details>
  </section>;
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
  const { document, loaded, update } = usePersonalization(userId);
  const order = sidebarOrder(document.sidebar);
  const hidden = new Set(document.sidebar.hidden);
  const setSidebar = (next: { order?: SidebarEntry[]; hidden?: SidebarEntry[] }) => update({ ...document, sidebar: { order: next.order ?? order, hidden: next.hidden ?? [...hidden] } });
  const move = (id: SidebarEntry, overId: SidebarEntry, position: "before" | "after") => {
    const without = order.filter(item => item !== id);
    const at = without.indexOf(overId) + (position === "after" ? 1 : 0);
    setSidebar({ order: [...without.slice(0, at), id, ...without.slice(at)] });
  };
  if (!loaded) return null;
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
