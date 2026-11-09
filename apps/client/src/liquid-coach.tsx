// The liquid Coach button (liquid.ts draws it). Closed, a living blob rests in the
// main column's bottom-right corner; open, it flows into the Coach bar, centred as
// before, and a × droplet buds off beside it. The DOM stays the truth: the blob,
// the bar and the × are real elements the liquid chases each frame, and their
// content fades in only once the liquid has arrived. With reduced motion (or no
// WebGL) they are plain CSS shapes that fade and scale.
import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { Sparkles, X } from "lucide-react";
import { LiquidSim, cssColor, liquidDefaults, liquidRenderer, type Box, type LiquidColors, type LiquidParams } from "./liquid";
import { cn } from "./ui";

/** True while the liquid draws the bar's surface: the bar drops its own background, border and shadow. */
const LiquidActive = createContext(false);
export const useLiquidActive = () => useContext(LiquidActive);

const reducedMotion = {
  get: () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches,
  subscribe: (watcher: () => void) => {
    if (typeof matchMedia !== "function") return () => {};
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    query.addEventListener("change", watcher);
    return () => query.removeEventListener("change", watcher);
  },
};

const boxOf = (element: Element | null, round: boolean): Box => {
  const rect = element?.getBoundingClientRect() ?? { left: 0, top: 0, width: 0, height: 0 };
  const w = rect.width / 2, h = rect.height / 2;
  const radius = round ? Math.min(w, h) : parseFloat(element ? getComputedStyle(element).borderTopLeftRadius : "0") || 0;
  return { x: rect.left + w, y: rect.top + h, w, h, r: radius };
};

const themeColors = (blob: string): LiquidColors => {
  const style = getComputedStyle(document.documentElement);
  const bar = cssColor(style.getPropertyValue("--color-background"));
  // The glint: a cool silver on a light bar (white would vanish), white on a dark one.
  const light = bar[0] * 0.3 + bar[1] * 0.59 + bar[2] * 0.11 > 0.5;
  return { blob: cssColor(blob), bar, line: cssColor(style.getPropertyValue("--color-border")), shine: light ? [0.62, 0.68, 0.84] : [1, 1, 1] };
};

/**
 * The bar's content lives inside the liquid: clipped to the liquid's current outline
 * (so it is revealed as the liquid spreads over it, and gathered up as it leaves),
 * and only visible once the liquid has turned the bar's colour.
 */
const clipTo = (element: HTMLElement, sim: LiquidSim, to: Box) => {
  const { body } = sim;
  if (!body) { element.style.clipPath = "inset(50%)"; element.style.opacity = "0"; return; }
  const w = body.w * (1 + body.j), h = body.h * (1 - body.j);
  const top = body.y - h - (to.y - to.h), bottom = to.y + to.h - (body.y + h);
  const left = body.x - w - (to.x - to.w), right = to.x + to.w - (body.x + w);
  const settled = sim.phase === "open" && Math.max(Math.abs(top), Math.abs(bottom), Math.abs(left), Math.abs(right)) < 0.5;
  element.style.clipPath = settled ? "" : `inset(${top}px ${right}px ${bottom}px ${left}px round ${Math.min(body.r, w, h)}px)`;
  element.style.opacity = String(Math.max(0, Math.min(1, (body.mix - 0.4) / 0.5)));
};

export function LiquidCoach({ open, onOpenChange, params = liquidDefaults, docked, children }: {
  open: boolean;
  onOpenChange(open: boolean): void;
  params?: LiquidParams;
  /** Shown beside the blob while closed (the pending changes, so they are never hidden). */
  docked?: ReactNode;
  /** The bar. Its `[data-liquid-target]` element is the surface the liquid becomes. */
  children: ReactNode;
}) {
  const reduced = useSyncExternalStore(reducedMotion.subscribe, reducedMotion.get, () => false);
  const [failed, setFailed] = useState(false);
  const active = !reduced && !failed;
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const blob = useRef<HTMLButtonElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const live = useRef({ open, params });
  live.current = { open, params };

  useEffect(() => {
    if (!active || !canvas.current || !host.current) return;
    const root = host.current;
    let renderer: ReturnType<typeof liquidRenderer>;
    try { renderer = liquidRenderer(canvas.current); } catch (error) { console.error(error); renderer = null; }
    if (!renderer) { setFailed(true); return; }
    const target = () => bar.current?.querySelector<HTMLElement>("[data-liquid-target]") ?? null;
    const targets = () => ({ blob: boxOf(blob.current, true), bar: boxOf(target() ?? bar.current, false) });
    const sim = new LiquidSim(live.current.params, targets());
    if (import.meta.env.DEV) Object.assign(window, { liquid: sim });
    let colors = themeColors(live.current.params.blobColor), colorKey = "";
    let last = performance.now(), time = 0, frame = 0, lap = 0;
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 1 / 20);
      last = now;
      const { params, open } = live.current;
      // The theme (the `dark` class) or the blob colour changed: read the tokens again.
      const key = params.blobColor + document.documentElement.className;
      if (key !== colorKey) { colors = themeColors(params.blobColor); colorKey = key; }
      sim.params = params;
      const boxes = targets();
      sim.setTargets(boxes);
      sim.setOpen(open);
      sim.step(dt);
      time += dt * params.wobbleSpeed;
      lap = (lap + dt / Math.max(params.shineLap, 0.5)) % 1;
      const arrival = sim.arrival();
      renderer.draw(sim.shapes(), params, colors, time, { bar: boxes.bar, shine: params.shine * arrival, phase: lap });
      root.style.setProperty("--liquid-bar", arrival.toFixed(3));
      const element = target();
      if (element) clipTo(element, sim, boxes.bar);
      root.dataset.liquidPhase = sim.phase;
      root.dataset.liquidPinches = String(sim.pinches);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      const element = target();
      if (element) { element.style.clipPath = ""; element.style.opacity = ""; }
    };
  }, [active]);

  // Closing from inside the bar hands the focus back to the button.
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current && !open && host.current?.contains(document.activeElement) && document.activeElement !== blob.current) blob.current?.focus({ preventScroll: true });
    wasOpen.current = open;
  }, [open]);

  const size = params.size * 2;
  // The bar stays centred and clear of the button on both sides.
  // Farther from the button than the goo reaches (plus the slosh), or the two would melt together.
  const room = (size + 16 + params.goo + 16) * 2;
  return <LiquidActive.Provider value={active}>
    <div ref={host} data-liquid={active ? "on" : "off"} data-open={open || undefined} style={active ? undefined : { "--liquid-bar": open ? 1 : 0 } as CSSProperties}
      className="ui pointer-events-none sticky bottom-0 z-[25] flex justify-center pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      onKeyDown={(event) => { if (event.key === "Escape" && open && !event.defaultPrevented) { event.preventDefault(); onOpenChange(false); } }}>
      {/* Behind the content, above the page: the liquid. */}
      {active && <canvas ref={canvas} aria-hidden="true" className="pointer-events-none fixed inset-0 size-full" />}
      <div ref={bar} inert={!open} data-liquid-bar="" style={{ width: `min(var(--spacing-page), calc(100% - ${room}px))` }}
        className={cn("relative flex flex-col", open && "pointer-events-auto",
          !active && "origin-bottom-right transition-[opacity,scale] duration-200 ease-out", !active && !open && "scale-90")}>
        {/* The composer moves with the liquid (clipTo); what floats above it (reply, review) fades in once it has arrived. */}
        <div className={cn("flex flex-col", active && "[&>:not([data-liquid-target])]:opacity-(--liquid-bar)")} style={active ? undefined : { opacity: "var(--liquid-bar)" }}>{children}</div>
      </div>
      {/* The button stays in the corner: the Coach while closed, the × while open. */}
      <div className="absolute right-4 bottom-[max(0.75rem,env(safe-area-inset-bottom))] flex items-center gap-3">
        {docked && <div inert={open} className={cn("transition-opacity duration-200", open ? "opacity-0" : "pointer-events-auto opacity-100")} data-liquid-docked="">{docked}</div>}
        <button ref={blob} type="button" aria-expanded={open} aria-label={open ? "Close the Coach" : "Open the Coach"} title={open ? "Close (Esc)" : "Coach"}
          onClick={() => onOpenChange(!open)} data-liquid-blob=""
          className={cn("pointer-events-auto relative flex shrink-0 items-center justify-center rounded-full text-white outline-offset-4", !active && "bg-brand shadow-popover")}
          style={{ width: size, height: size }}>
          <Sparkles aria-hidden="true" className={cn("absolute size-5 transition-[opacity,rotate,scale] duration-300 ease-out", open && "scale-50 rotate-90 opacity-0")} />
          <X aria-hidden="true" className={cn("absolute size-5 transition-[opacity,rotate,scale] duration-300 ease-out", !open && "scale-50 -rotate-90 opacity-0")} />
        </button>
      </div>
    </div>
  </LiquidActive.Provider>;
}
