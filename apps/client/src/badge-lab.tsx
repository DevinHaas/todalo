// Toolcraft lab for the member badge (badge.html, dev server only): one large badge with
// a live panel, plus a row of other member numbers to check that every tree differs.
// References: docs/badge/mockups/round-3.
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Copy, RotateCcw, X } from "lucide-react";
import "@fontsource-variable/geist";
import "./ui/styles.css";
import { Button, ControlItem, ControlList, ControlSection, PanelTitle, SegmentedControl, SelectControl, SliderControl } from "./ui";
import "./badge-fonts";
import { ACCENTS, BONSAI_STYLES, BadgeCard, NUMBER_STYLES, badgeSceneDefaults, bonsaiTraits, type Accent, type BadgeSceneParams, type BonsaiStyle, type NumberStyle } from "@todalo/badge";

const KEY = "todalo-badge-lab";
type LabState = { member: number; name: string; style: BonsaiStyle | "auto"; params: BadgeSceneParams };
const initial: LabState = { member: 42, name: "Ada Lovelace", style: "auto", params: badgeSceneDefaults };
const read = (): LabState => { try { const s = JSON.parse(localStorage.getItem(KEY) ?? "null"); return { ...initial, ...s, params: { ...badgeSceneDefaults, ...s?.params } }; } catch { return initial; } };

type Slider = { key: Exclude<keyof BadgeSceneParams, "dark" | "number" | "accent">; name: string; min: number; max: number; step: number };
const sliders: Slider[] = [
  { key: "lines", name: "Lines", min: 60, max: 260, step: 1 },
  { key: "streak", name: "Streaks", min: 0, max: 3, step: 0.05 },
  { key: "mist", name: "Mist", min: 0, max: 2, step: 0.05 },
  { key: "particles", name: "Particles", min: 0, max: 1, step: 0.05 },
  { key: "speed", name: "Speed", min: 0, max: 3, step: 0.05 },
  { key: "sway", name: "Turn", min: 0, max: 1.5, step: 0.05 },
  { key: "ground", name: "Ground line", min: 0.5, max: 0.85, step: 0.01 },
  { key: "depth", name: "Number depth", min: 0.3, max: 2, step: 0.05 },
];
const GRID = [1, 7, 208, 512, 777, 1337, 2024, 4096];
const NAMES = ["Mira Okafor", "Kai Nakamura", "Jonas Berg", "Lea Fontaine", "Sam Ortiz", "Noor Haddad", "Iris Vogel", "Theo Park"];

function Panel({ state, onChange, onClose }: { state: LabState; onChange(state: LabState): void; onClose(): void }) {
  const [copied, setCopied] = useState(false);
  const set = (params: Partial<BadgeSceneParams>) => onChange({ ...state, params: { ...state.params, ...params } });
  const traits = bonsaiTraits(state.member, state.style === "auto" ? undefined : state.style);
  return <aside aria-label="Badge parameters"
    className="ui fixed top-3 right-3 z-40 flex max-h-[calc(100vh-1.5rem)] w-72 flex-col overflow-y-auto rounded-xl border border-border bg-background text-sm shadow-popover">
    <div className="flex items-center justify-between px-3 pt-3 pb-2">
      <PanelTitle>Member badge</PanelTitle>
      <div className="flex gap-0.5">
        <Button type="button" variant="ghost" size="icon-xs" aria-label="Copy the scene values as JSON" title="Copy JSON"
          onClick={() => { void navigator.clipboard.writeText(JSON.stringify(state.params, null, 2)); setCopied(true); setTimeout(() => setCopied(false), 1200); }}>{copied ? "✓" : <Copy />}</Button>
        <Button type="button" variant="ghost" size="icon-xs" aria-label="Reset" title="Reset" onClick={() => onChange(initial)}><RotateCcw /></Button>
        <Button type="button" variant="ghost" size="icon-xs" aria-label="Hide the panel" title="Hide" onClick={onClose}><X /></Button>
      </div>
    </div>
    <ControlSection>
      <ControlList>
        <ControlItem><SliderControl name="Member #" value={state.member} min={1} max={9999} step={1}
          onValueChange={(member) => onChange({ ...state, member: Math.round(member) })} /></ControlItem>
        <ControlItem><SelectControl name="Style" value={state.style}
          options={[{ label: `Auto (${bonsaiTraits(state.member).style})`, value: "auto" }, ...BONSAI_STYLES.map(value => ({ label: value, value }))]}
          onValueChange={(style) => onChange({ ...state, style: style as LabState["style"] })} /></ControlItem>
        <ControlItem><SegmentedControl name="Card" value={state.params.dark ? "dark" : "light"}
          options={[{ label: "Light", value: "light" }, { label: "Dark", value: "dark" }]} onValueChange={(value) => set({ dark: value === "dark" })} /></ControlItem>
        <ControlItem><SelectControl name="Number" value={state.params.number}
          options={NUMBER_STYLES.map(value => ({ label: value, value }))} onValueChange={(value) => set({ number: value as NumberStyle })} /></ControlItem>
        <ControlItem><SelectControl name="Red accent" value={state.params.accent}
          options={ACCENTS.map(value => ({ label: value, value }))} onValueChange={(value) => set({ accent: value as Accent })} /></ControlItem>
        {sliders.map(slider => <ControlItem key={slider.key}><SliderControl name={slider.name} value={state.params[slider.key]} min={slider.min} max={slider.max} step={slider.step}
          onValueChange={(value) => set({ [slider.key]: value })} /></ControlItem>)}
      </ControlList>
      <p className="px-3 pt-2 pb-3 text-xs text-muted-foreground">pot {traits.pot} · pads {traits.pads} · deadwood {traits.deadwood} · roots {traits.roots}</p>
    </ControlSection>
  </aside>;
}

function Lab() {
  const [state, setState] = useState(read);
  const [panel, setPanel] = useState(true);
  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(state)); }, [state]);
  const style = state.style === "auto" ? undefined : state.style;

  return <div className="min-h-svh px-8 py-12" style={{ background: state.params.dark ? "#1b1b1a" : "#ecebe7" }}>
    <div className="mx-auto flex max-w-6xl flex-col items-center gap-14">
      <BadgeCard member={state.member} name={state.name} since="2026-06-14" founding={state.member <= 100} logo="/todalo-logo.svg" style={style} params={state.params} width={380} />
      <div className="grid grid-cols-4 gap-6">
        {GRID.map((member, i) => <button key={member} type="button" className="cursor-pointer border-0 bg-transparent p-0 text-left" title={`Show #${member}`}
          onClick={() => setState({ ...state, member, name: NAMES[i], style: "auto" })}>
          <BadgeCard member={member} name={NAMES[i]} since="2026-09-02" founding={member <= 100} logo="/todalo-logo.svg" params={state.params} width={210} />
        </button>)}
      </div>
    </div>
    {panel ? <Panel state={state} onChange={setState} onClose={() => setPanel(false)} />
      : <Button type="button" variant="outline" className="fixed top-3 right-3" onClick={() => setPanel(true)}>Panel</Button>}
  </div>;
}

const root = createRoot(document.getElementById("root")!);
root.render(<Lab />);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
