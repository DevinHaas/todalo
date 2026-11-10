// Toolcraft lab for the landing page's footer shader (footer.html, dev server only): a
// mock of the closing CTA, the shader band and the footer, with a live panel. Move the
// mouse over the band to see it react. Copy puts the JSON on the clipboard to paste over
// `footerShaderDefaults` in apps/web/components/landing/footer-shader.ts.
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Copy, RotateCcw, X } from "lucide-react";
import "@fontsource-variable/geist";
import "./ui/styles.css";
import { Button, ControlItem, ControlList, ControlSection, PanelTitle, SegmentedControl, SliderControl } from "./ui";
// ponytail: the lab reaches into apps/web for the one shader module both sides share.
import { FOOTER_VARIANTS, footerShaderDefaults, mountFooterShader, type FooterShaderParams, type FooterVariant } from "../../web/components/landing/footer-shader";

const KEY = "todalo-footer-shader";
const read = (): FooterShaderParams => { try { return { ...footerShaderDefaults, ...JSON.parse(localStorage.getItem(KEY) ?? "null") }; } catch { return footerShaderDefaults; } };

type Slider = { key: Exclude<keyof FooterShaderParams, "variant">; name: string; min: number; max: number; step: number; unit?: string };
const sliders: Slider[] = [
  { key: "height", name: "Band height", min: 120, max: 480, step: 10, unit: "px" },
  { key: "speed", name: "Speed", min: 0, max: 3, step: 0.05, unit: "×" },
  { key: "scale", name: "Scale", min: 0.5, max: 6, step: 0.1 },
  { key: "edge", name: "Edge (top → bottom)", min: 0.2, max: 0.8, step: 0.01 },
  { key: "softness", name: "Softness", min: 0.02, max: 0.5, step: 0.01 },
  { key: "grain", name: "Grain", min: 0, max: 1, step: 0.05 },
  { key: "pull", name: "Mouse pull", min: 0, max: 2, step: 0.05 },
  { key: "radius", name: "Mouse radius", min: 40, max: 400, step: 10, unit: "px" },
  { key: "accent", name: "Red accent", min: 0, max: 1, step: 0.05 },
];
const label: Record<FooterVariant, string> = { mist: "Mist", ink: "Ink", halftone: "Halftone", contours: "Contours" };

function Panel({ params, onChange, onClose }: { params: FooterShaderParams; onChange(params: FooterShaderParams): void; onClose(): void }) {
  const [copied, setCopied] = useState(false);
  return <aside aria-label="Footer shader parameters"
    className="ui fixed top-3 right-3 z-[60] flex max-h-[calc(100vh-1.5rem)] w-72 flex-col overflow-y-auto rounded-xl border border-border bg-background text-sm shadow-popover">
    <div className="flex items-center justify-between px-3 pt-3 pb-2">
      <PanelTitle>Footer shader</PanelTitle>
      <div className="flex gap-0.5">
        <Button type="button" variant="ghost" size="icon-xs" aria-label="Copy the values as JSON" title="Copy JSON"
          onClick={() => { void navigator.clipboard.writeText(JSON.stringify(params, null, 2)); setCopied(true); setTimeout(() => setCopied(false), 1200); }}>{copied ? "✓" : <Copy />}</Button>
        <Button type="button" variant="ghost" size="icon-xs" aria-label="Reset to the page's values" title="Reset" onClick={() => onChange(footerShaderDefaults)}><RotateCcw /></Button>
        <Button type="button" variant="ghost" size="icon-xs" aria-label="Hide the panel" title="Hide" onClick={onClose}><X /></Button>
      </div>
    </div>
    <ControlSection>
      <div className="px-3"><SegmentedControl name="Variant" value={params.variant} onValueChange={(value) => onChange({ ...params, variant: value as FooterVariant })}
        options={FOOTER_VARIANTS.map(value => ({ label: label[value], value }))} /></div>
      <ControlList>{sliders.map(slider =>
        <ControlItem key={slider.key}><SliderControl name={slider.name} value={params[slider.key]} min={slider.min} max={slider.max} step={slider.step} unit={slider.unit}
          onValueChange={(value) => onChange({ ...params, [slider.key]: value })} /></ControlItem>)}</ControlList>
    </ControlSection>
  </aside>;
}

function Lab() {
  const [params, setParams] = useState(read);
  const [panel, setPanel] = useState(true);
  const live = useRef(params);
  live.current = params;
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(params)); }, [params]);
  useEffect(() => mountFooterShader(canvas.current!, () => live.current), []);

  // Same colours and rhythm as the landing page's closing section and footer.
  return <div className="min-h-svh bg-[#f5f4f1] text-[#121211]">
    <section className="mx-auto max-w-3xl px-6 pt-24 pb-20 text-center">
      <h1 className="font-serif text-6xl leading-[0.85] font-black tracking-tight">Your next season<br /><span className="font-thin">starts today.</span></h1>
      <p className="mx-auto mt-6 max-w-md text-base text-black/55">Twelve weeks, a few goals that matter, and time set aside for them. Free to start.</p>
      <div className="mt-7 flex justify-center gap-3">
        <span className="rounded-full bg-[oklch(0.55_0.21_27)] px-6 py-3 text-sm font-medium text-white">Get started</span>
        <span className="rounded-full border border-black/10 bg-white/70 px-5 py-3 text-sm font-medium">See pricing</span>
      </div>
    </section>
    <div className="relative" style={{ height: params.height, background: "linear-gradient(to bottom, #f5f4f1, #121211)" }}>
      <canvas ref={canvas} className="absolute inset-0 size-full opacity-0" />
    </div>
    <footer className="bg-[#121211] px-6 pt-6 pb-16 text-sm text-white/60">
      <div className="mx-auto grid max-w-5xl grid-cols-3 gap-10">
        <div><div className="font-semibold text-white">todalo</div><p className="mt-3 text-white/50">Plan your season. Let the rest flow.</p></div>
        <div className="space-y-2"><div className="font-medium text-white/85">Product</div><div>Features</div><div>Integrations</div><div>Pricing</div></div>
        <div className="space-y-2"><div className="font-medium text-white/85">Account</div><div>Log in</div><div>Get started</div></div>
      </div>
    </footer>
    {panel ? <Panel params={params} onChange={setParams} onClose={() => setPanel(false)} />
      : <Button type="button" variant="outline" className="fixed top-3 right-3" onClick={() => setPanel(true)}>Panel</Button>}
  </div>;
}

const root = createRoot(document.getElementById("root")!);
root.render(<Lab />);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
