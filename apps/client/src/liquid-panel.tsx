// Dev-only: a live Toolcraft panel for the liquid Coach button's parameters (the
// lab page, and the app with ?liquid or Alt+Shift+L). The values persist in
// localStorage; presets save by name, and Copy puts the JSON on the clipboard to
// paste over `liquidDefaults` in liquid.ts.
import { useEffect, useState } from "react";
import { Copy, RotateCcw, Save, X } from "lucide-react";
import { liquidDefaults, type LiquidParams } from "./liquid";
import { Button, ColorControl, ControlItem, ControlList, ControlSection, Input, PanelTitle, SliderControl } from "./ui";

const KEY = "todalo-liquid", PRESETS = "todalo-liquid-presets";
const read = <T,>(key: string, fallback: T): T => { try { return { ...fallback, ...JSON.parse(localStorage.getItem(key) ?? "null") }; } catch { return fallback; } };

/** The parameters: the defaults in production, the panel's values in dev. */
export function useLiquidParams() {
  const [params, setParams] = useState<LiquidParams>(() => import.meta.env.DEV ? read(KEY, liquidDefaults) : liquidDefaults);
  useEffect(() => { if (import.meta.env.DEV) localStorage.setItem(KEY, JSON.stringify(params)); }, [params]);
  return [params, setParams] as const;
}

/** ?liquid in the URL, or Alt+Shift+L, shows the panel (dev builds only). */
export function useLiquidPanelToggle() {
  const [shown, setShown] = useState(() => import.meta.env.DEV && new URLSearchParams(location.search).has("liquid"));
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const toggle = (event: KeyboardEvent) => { if (event.altKey && event.shiftKey && event.code === "KeyL") { event.preventDefault(); setShown(on => !on); } };
    window.addEventListener("keydown", toggle);
    return () => window.removeEventListener("keydown", toggle);
  }, []);
  return [shown, setShown] as const;
}

type Slider = { key: keyof LiquidParams; name: string; min: number; max: number; step: number; unit?: string };
const groups: { title: string; sliders: Slider[] }[] = [
  { title: "Shape", sliders: [
    { key: "size", name: "Blob size", min: 12, max: 48, step: 1, unit: "px" },
    { key: "closeSize", name: "× size", min: 10, max: 24, step: 1, unit: "px" },
    { key: "goo", name: "Gooeyness", min: 0, max: 48, step: 1, unit: "px" },
    { key: "gloss", name: "Gloss", min: 0, max: 1, step: 0.05 },
    { key: "shadow", name: "Shadow", min: 0, max: 2, step: 0.05 },
  ] },
  { title: "Physics", sliders: [
    { key: "duration", name: "Morph duration", min: 0.2, max: 2.5, step: 0.05, unit: "s" },
    { key: "tension", name: "Surface tension", min: 0.2, max: 3, step: 0.05 },
    { key: "viscosity", name: "Viscosity", min: 0.1, max: 1.5, step: 0.01 },
    { key: "lag", name: "Spread lag", min: 0.3, max: 1.5, step: 0.05 },
    { key: "spreadAt", name: "Spread at (way left)", min: 0, max: 1, step: 0.05 },
    { key: "stretch", name: "Squash & stretch", min: 0, max: 3, step: 0.05 },
  ] },
  { title: "Pinch-off", sliders: [
    { key: "neck", name: "Neck length", min: 5, max: 200, step: 1, unit: "px" },
    { key: "pinch", name: "Pinch threshold", min: 0.5, max: 10, step: 0.25, unit: "px" },
    { key: "satellites", name: "Satellite beads", min: 0, max: 5, step: 1 },
  ] },
  { title: "Wobble", sliders: [
    { key: "wobbleSpeed", name: "Speed", min: 0, max: 4, step: 0.05 },
    { key: "wobbleAmp", name: "Amplitude", min: 0, max: 8, step: 0.1, unit: "px" },
    { key: "barWobble", name: "Bar keeps", min: 0, max: 1, step: 0.05 },
  ] },
];

export function LiquidPanel({ params, onChange, onClose }: { params: LiquidParams; onChange(params: LiquidParams): void; onClose?(): void }) {
  const [presets, setPresets] = useState<Record<string, LiquidParams>>(() => read(PRESETS, {}));
  const [name, setName] = useState("");
  const [copied, setCopied] = useState(false);
  const savePresets = (next: Record<string, LiquidParams>) => { setPresets(next); localStorage.setItem(PRESETS, JSON.stringify(next)); };
  const set = (key: keyof LiquidParams, value: number | string) => onChange({ ...params, [key]: value });

  return <aside aria-label="Liquid parameters" data-liquid-panel=""
    className="ui fixed top-3 right-3 z-[60] flex max-h-[calc(100vh-1.5rem)] w-72 flex-col overflow-y-auto rounded-xl border border-border bg-background text-sm shadow-popover">
    <div className="flex items-center justify-between px-3 pt-3 pb-2">
      <PanelTitle>Liquid Coach</PanelTitle>
      <div className="flex gap-0.5">
        <Button type="button" variant="ghost" size="icon-xs" aria-label="Copy the values as JSON" title="Copy JSON"
          onClick={() => { void navigator.clipboard.writeText(JSON.stringify(params, null, 2)); setCopied(true); setTimeout(() => setCopied(false), 1200); }}>{copied ? "✓" : <Copy />}</Button>
        <Button type="button" variant="ghost" size="icon-xs" aria-label="Reset to the defaults" title="Reset" onClick={() => onChange(liquidDefaults)}><RotateCcw /></Button>
        {onClose && <Button type="button" variant="ghost" size="icon-xs" aria-label="Hide the panel" title="Hide (Alt+Shift+L)" onClick={onClose}><X /></Button>}
      </div>
    </div>
    <ControlSection>
      <ControlList>
        <ControlItem><ColorControl name="Blob colour" hex={params.blobColor} onValueChange={(value) => set("blobColor", value.hex)} /></ControlItem>
        <ControlItem><SliderControl name="× tint (blob → bar)" value={params.closeTint} min={0} max={1} step={0.05} onValueChange={(value) => set("closeTint", value)} /></ControlItem>
      </ControlList>
    </ControlSection>
    {groups.map(group => <ControlSection key={group.title}>
      <div className="px-3 pt-1"><PanelTitle>{group.title}</PanelTitle></div>
      <ControlList>{group.sliders.map(slider =>
        <ControlItem key={slider.key}><SliderControl name={slider.name} value={params[slider.key] as number} min={slider.min} max={slider.max} step={slider.step} unit={slider.unit}
          onValueChange={(value) => set(slider.key, value)} /></ControlItem>)}</ControlList>
    </ControlSection>)}
    <ControlSection>
      <div className="px-3 pt-1"><PanelTitle>Presets</PanelTitle></div>
      <form className="flex gap-1.5 px-3" onSubmit={(event) => { event.preventDefault(); if (!name.trim()) return; savePresets({ ...presets, [name.trim()]: params }); setName(""); }}>
        <Input aria-label="Preset name" placeholder="Name" value={name} onChange={(event) => setName(event.target.value)} className="flex-1" />
        <Button type="submit" variant="outline" size="icon" aria-label="Save preset" title="Save preset" disabled={!name.trim()}><Save /></Button>
      </form>
      {Object.keys(presets).length > 0 && <ul className="flex flex-wrap gap-1 px-3">{Object.entries(presets).map(([key, value]) =>
        <li key={key} className="flex items-center rounded-md border border-border">
          <button type="button" className="px-2 py-0.5 text-xs" onClick={() => onChange({ ...liquidDefaults, ...value })}>{key}</button>
          <button type="button" aria-label={`Delete ${key}`} className="px-1 text-muted-foreground hover:text-foreground"
            onClick={() => { const next = { ...presets }; delete next[key]; savePresets(next); }}><X className="size-3" /></button>
        </li>)}</ul>}
    </ControlSection>
  </aside>;
}
