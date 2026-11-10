"use client";

import { useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";

// logo: a file in public/landing/logos (brand SVGs from the CC0 "logos" and MIT "theSVG"
// sets; the Apple apps' icons taken from macOS). Marks stay their owners' trademarks.
// live: the one-liner shown when the tile is in focus. No `live` = not built yet ("Coming soon").
type Integration = { name: string; logo: string; live?: string };

const INTEGRATIONS: Integration[] = [
  { name: "Google Calendar", logo: "google-calendar.svg", live: "Time blocks sync with your Google Calendar." },
  { name: "Todoist", logo: "todoist.svg", live: "Bring your projects and tasks over in one import." },
  { name: "OpenAI", logo: "openai.svg", live: "Sign in with ChatGPT or use your own key for the Coach." },
  { name: "Anthropic", logo: "anthropic.svg", live: "Your own Claude API key powers the Coach." },
  { name: "OpenRouter", logo: "openrouter.svg", live: "Any model on OpenRouter, with your own key." },
  { name: "Ollama", logo: "ollama.svg", live: "Run the Coach on a local model." },
  { name: "Notion", logo: "notion.svg" },
  { name: "Slack", logo: "slack.svg" },
  { name: "Gmail", logo: "gmail.svg" },
  { name: "Apple Mail", logo: "apple-mail.webp" },
  { name: "Outlook", logo: "outlook.svg" },
  { name: "Apple Calendar", logo: "apple-calendar.webp" },
  { name: "Outlook Calendar", logo: "outlook-calendar.svg" },
  { name: "Apple Reminders", logo: "apple-reminders.webp" },
  { name: "Microsoft To Do", logo: "microsoft-todo.svg" },
  { name: "Linear", logo: "linear.svg" },
  { name: "GitHub", logo: "github.svg" },
  { name: "Obsidian", logo: "obsidian.svg" },
  { name: "Zoom", logo: "zoom.svg" },
  { name: "Zapier", logo: "zapier.svg" },
  { name: "Raycast", logo: "raycast.svg" },
  { name: "Shortcuts", logo: "apple-shortcuts.webp" },
  { name: "Telegram", logo: "telegram.svg" },
];

const RADIUS = 220;
const TILE = 80;
const SLICES = 6;
const TILT = -10; // resting tilt, so a little of the top shows
const SPIN = 6; // deg per second while drifting
const DRIFT_MS = 2600; // spin between two auto focuses
const HOLD_MS = 3200; // how long a focused tile stays at the front
const TURN_MS = 1600; // the eased turn that brings a tile to the front
const SNAP_MS = 750; // letting go of a drag settles on the tile nearest the front

// Fibonacci sphere: even spacing for any count, over (almost) the whole sphere so the
// silhouette stays round; only the very poles are left out.
const POINTS = INTEGRATIONS.map((_, i) => {
  const y = 1 - ((i + 0.5) / INTEGRATIONS.length) * 2;
  // rounded: server and client must print the same transform strings
  return { lat: Math.round(Math.asin(y * 0.92) * (180 / Math.PI) * 10) / 10, lon: Math.round(((i * 137.508) % 360) * 10) / 10 };
});

const rad = (d: number) => (d * Math.PI) / 180;
/** Depth (-1 back … 1 front) of a tile under the globe's rotation, same order as the CSS transforms. */
function depth({ lat, lon }: { lat: number; lon: number }, rx: number, ry: number) {
  // tile: rotateY(lon) rotateX(lat) translateZ(1); globe: rotateX(rx) rotateY(ry)
  const y = -Math.sin(rad(lat));
  let z = Math.cos(rad(lat));
  let x = z * Math.sin(rad(lon));
  z = z * Math.cos(rad(lon));
  [x, z] = [x * Math.cos(rad(ry)) + z * Math.sin(rad(ry)), -x * Math.sin(rad(ry)) + z * Math.cos(rad(ry))];
  return y * Math.sin(rad(rx)) + z * Math.cos(rad(rx));
}
/** The shortest signed turn from `from` to `to`, in degrees. */
const turn = (from: number, to: number) => ((((to - from) % 360) + 540) % 360) - 180;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** One tile's face: card, logo, and the clock badge for what isn't built yet. */
function Face({ item, focused }: { item: Integration; focused: boolean }) {
  return (
    <div
      className={
        "relative grid place-items-center rounded-[18px] border bg-gradient-to-b from-white to-[#fbfaf8] transition-[border-color] duration-700 " +
        (focused ? "border-black/[0.08]" : "border-white/90")
      }
      style={{ width: TILE, height: TILE }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny static logo, repeated per slice inside a 3D scene */}
      <img src={`/landing/logos/${item.logo}`} alt="" className="size-[38px] object-contain" loading="lazy" decoding="async" draggable={false} />
      {!item.live && (
        <span className="absolute right-1 top-1 grid size-4 place-items-center rounded-full border border-black/[0.06] bg-white text-foreground/55 shadow-[0_1px_2px_rgba(0,0,0,0.08)]">
          <Clock className="size-2.5" strokeWidth={2.2} />
        </span>
      )}
    </div>
  );
}

/**
 * A tile on the sphere, cut into vertical slices bent along the great circle through its
 * centre, so it lies on the surface with the sphere's own curvature. Two animated custom
 * properties on the tile (registered in globals.css) do the focus in one piece: --bend
 * (1 curved … 0 flat) and --lift (0 on the surface … 1 lifted and scaled). --depth fades
 * the tile out as it turns away; it sits on the slices, since opacity on a 3D container
 * would flatten it.
 */
function Tile({ item, lat, lon, focused, tileRef }: { item: Integration; lat: number; lon: number; focused: boolean; tileRef: (el: HTMLDivElement | null) => void }) {
  const sliceW = TILE / SLICES;
  return (
    <div
      ref={tileRef}
      className="absolute left-0 top-0 [transform-style:preserve-3d] transition-[--bend,--lift] duration-[1100ms] ease-in-out"
      style={{ "--bend": focused ? 0 : 1, "--lift": focused ? 1 : 0 } as React.CSSProperties}
    >
      {Array.from({ length: SLICES }, (_, s) => {
        const along = (s + 0.5) * sliceW - TILE / 2;
        const angle = ((along / RADIUS) * 180) / Math.PI;
        return (
          <div
            key={s}
            className="absolute overflow-hidden [backface-visibility:hidden]"
            style={{
              // a hairline overlap hides the seams between slices
              width: sliceW + 0.6,
              height: TILE,
              marginLeft: -sliceW / 2,
              marginTop: -TILE / 2,
              opacity: "var(--depth, 1)",
              // to the tile's spot, lift and scale there, then bend the slice along the great circle
              transform:
                `rotateY(${lon}deg) rotateX(${lat}deg) translateZ(calc(${RADIUS}px + var(--lift) * 26px)) scale(calc(1 + var(--lift) * 0.3)) ` +
                `translateX(calc((1 - var(--bend)) * ${along.toFixed(2)}px)) translateZ(-${RADIUS}px) rotateY(calc(var(--bend) * ${angle.toFixed(3)}deg)) translateZ(${RADIUS}px)`,
            }}
          >
            <div style={{ marginLeft: -s * sliceW }}>
              <Face item={item} focused={focused} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Integrations() {
  const stage = useRef<HTMLDivElement>(null);
  const globe = useRef<HTMLDivElement>(null);
  const tiles = useRef<(HTMLDivElement | null)[]>([]);
  const [focus, setFocus] = useState<number | null>(0);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rot = { x: -POINTS[0].lat, y: -POINTS[0].lon };
    // One state machine: an eased turn to a tile, holding it, drifting, or the user's hand.
    type Mode =
      | { kind: "turn"; from: { x: number; y: number }; to: { x: number; y: number }; start: number; tile: number; ms: number; snap: boolean }
      | { kind: "hold"; until: number; tile: number }
      | { kind: "drift"; since: number; until: number }
      | { kind: "drag"; lastX: number; lastY: number; vx: number; vy: number };
    let mode: Mode = { kind: "hold", until: performance.now() + HOLD_MS, tile: 0 };
    let last = performance.now();
    let frame = 0;
    let downAt = { x: 0, y: 0, moved: false, tile: -1 };
    let lastMoveAt = 0;

    let shown: number | null = 0;
    // only touch React state when the focused tile actually changes
    const focusTile = (tile: number | null) => {
      if (tile !== shown) setFocus((shown = tile));
    };
    const turnTo = (tile: number, now: number, snap = false) => {
      const to = { x: clamp(-POINTS[tile].lat, -55, 55), y: rot.y + turn(rot.y, -POINTS[tile].lon) };
      if (reduce) {
        // no animation loop: jump straight to the tile
        Object.assign(rot, to);
        paint();
        focusTile(tile);
        mode = { kind: "hold", until: now + HOLD_MS, tile };
        return;
      }
      mode = { kind: "turn", from: { ...rot }, to, start: now, tile, ms: snap ? SNAP_MS : TURN_MS, snap };
      focusTile(null);
    };
    /** The tile nearest the front if the globe kept turning a moment longer at (vx, vy) deg/s. */
    const frontTile = (vx: number, vy: number) => {
      const x = clamp(rot.x + vy * 0.25, -60, 60);
      const y = rot.y + vx * 0.25;
      let best = 0;
      let bestDepth = -Infinity;
      POINTS.forEach((p, i) => {
        const d = depth(p, x, y);
        if (d > bestDepth) [best, bestDepth] = [i, d];
      });
      return best;
    };
    /** The next tile coming round the front, near the equator so the globe doesn't nod. */
    const nextTile = () => {
      let best = -1;
      let bestGap = Infinity;
      POINTS.forEach((p, i) => {
        if (Math.abs(p.lat) > 30) return;
        const gap = ((turn(rot.y, -p.lon) + 360) % 360) || 360;
        if (gap > 14 && gap < bestGap) [best, bestGap] = [i, gap];
      });
      return best;
    };

    const paint = () => {
      if (globe.current) globe.current.style.transform = `rotateX(${rot.x}deg) rotateY(${rot.y}deg)`;
      POINTS.forEach((p, i) => {
        // fully there on the front half, gone before it turns its back
        tiles.current[i]?.style.setProperty("--depth", smooth(0.02, 0.45, depth(p, rot.x, rot.y)).toFixed(3));
      });
    };

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (mode.kind === "turn") {
        const t = clamp((now - mode.start) / mode.ms, 0, 1);
        // a snap starts at the hand's speed and settles; an auto turn eases in and out
        const k = mode.snap ? easeOut(t) : ease(t);
        rot.x = mode.from.x + (mode.to.x - mode.from.x) * k;
        rot.y = mode.from.y + (mode.to.y - mode.from.y) * k;
        // the tile straightens and lifts as the turn settles, not after it
        if (t > 0.55) focusTile(mode.tile);
        if (t >= 1) mode = { kind: "hold", until: now + HOLD_MS, tile: mode.tile };
      } else if (mode.kind === "hold") {
        if (now > mode.until) {
          focusTile(null);
          mode = { kind: "drift", since: now, until: now + DRIFT_MS };
        }
      } else if (mode.kind === "drift") {
        // the spin builds up gently instead of starting at full speed
        rot.y += SPIN * dt * smooth(0, 1200, now - mode.since);
        rot.x += (TILT - rot.x) * Math.min(1, dt * 1.2);
        if (now > mode.until) {
          const tile = nextTile();
          if (tile >= 0) turnTo(tile, now);
          else mode.until = now + DRIFT_MS;
        }
      }
      paint();
      frame = requestAnimationFrame(tick);
    };

    // Drag to rotate (any direction with a mouse; on touch, sideways rotates and up/down scrolls the page).
    const el = stage.current!;
    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      el.setPointerCapture(event.pointerId);
      // the tile under the pointer, read before capture retargets the following events to the stage
      const hit = (event.target as HTMLElement).closest<HTMLElement>("[data-tile]");
      downAt = { x: event.clientX, y: event.clientY, moved: false, tile: hit ? Number(hit.dataset.tile) : -1 };
      lastMoveAt = 0;
      mode = { kind: "drag", lastX: event.clientX, lastY: event.clientY, vx: 0, vy: 0 };
      setDragging(true);
    };
    const onMove = (event: PointerEvent) => {
      if (mode.kind !== "drag") return;
      const dx = event.clientX - mode.lastX;
      const dy = event.clientY - mode.lastY;
      if (Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y) > 4 && !downAt.moved) {
        downAt.moved = true;
        focusTile(null);
      }
      rot.y += dx * 0.35;
      rot.x = clamp(rot.x - dy * 0.35, -60, 60);
      // velocity in deg/s, smoothed, for the fling
      const dt = Math.max(1, event.timeStamp - (lastMoveAt || event.timeStamp - 16)) / 1000;
      lastMoveAt = event.timeStamp;
      mode.vx = mode.vx * 0.6 + ((dx * 0.35) / dt) * 0.4;
      mode.vy = mode.vy * 0.6 + ((-dy * 0.35) / dt) * 0.4;
      [mode.lastX, mode.lastY] = [event.clientX, event.clientY];
      if (reduce) paint();
    };
    const onUp = () => {
      if (mode.kind !== "drag") return;
      setDragging(false);
      const now = performance.now();
      // a click on a tile brings it to the front
      if (!downAt.moved && downAt.tile >= 0) return turnTo(downAt.tile, now);
      // letting go snaps to the tile nearest the front, carrying a little of the fling
      turnTo(frontTile(clamp(mode.vx, -400, 400), clamp(mode.vy, -300, 300)), now, true);
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);

    paint();
    if (!reduce) frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, []);

  const current = focus === null ? null : INTEGRATIONS[focus];

  return (
    <section id="integrations" aria-labelledby="integrations-title" className="relative mx-auto w-full max-w-6xl px-6 py-24 md:py-36">
      <div className="landing-reveal mx-auto max-w-2xl text-center">
        <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-foreground/45">Integrations</p>
        <h2 id="integrations-title" className="mt-4 font-display text-[clamp(2.4rem,5vw,4.25rem)] leading-[0.77] tracking-[-0.01em]">
          <span className="block font-black">Fits the tools</span>
          <span className="block font-thin">you already use.</span>
        </h2>
        <p className="mx-auto mt-6 max-w-md text-[15px] leading-relaxed text-foreground/55 md:text-base">
          Your calendar and your old task list today, and your own AI keys. More is on the way.
        </p>
      </div>

      <div className="landing-reveal-soft relative mx-auto mt-6 h-[400px] max-w-4xl md:mt-8 md:h-[620px]">
        <div
          ref={stage}
          className={"absolute inset-0 touch-pan-y select-none [perspective:1500px] max-md:scale-[0.62] " + (dragging ? "cursor-grabbing" : "cursor-grab")}
        >
          <div ref={globe} className="absolute left-1/2 top-1/2 [transform-style:preserve-3d]" aria-hidden>
            {INTEGRATIONS.map((item, i) => (
              <div key={item.name} data-tile={i} className="contents">
                <Tile
                  item={item}
                  lat={POINTS[i].lat}
                  lon={POINTS[i].lon}
                  focused={focus === i}
                  tileRef={(el) => {
                    tiles.current[i] = el;
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* The line beside the tile in focus (it always sits at the globe's front centre). */}
        <div
          aria-live="polite"
          className={
            "pointer-events-none absolute left-1/2 top-1/2 ml-20 w-60 -translate-y-1/2 rounded-[18px] border border-white/90 bg-gradient-to-b from-white/95 to-white/75 px-4 py-3 shadow-[0_18px_40px_-20px_rgba(0,0,0,0.3)] backdrop-blur transition-[opacity,translate] duration-700 ease-out max-md:left-1/2 max-md:top-auto max-md:bottom-0 max-md:ml-0 max-md:-translate-x-1/2 max-md:translate-y-0 md:ml-24 " +
            (current ? "opacity-100" : "opacity-0 md:translate-x-2")
          }
        >
          {current && (
            <>
              <p className="text-[13px] font-medium text-foreground">{current.name}</p>
              <p className={"mt-0.5 text-[12px] leading-snug " + (current.live ? "text-foreground/60" : "text-foreground/45")}>
                {current.live ?? "Coming soon"}
              </p>
            </>
          )}
        </div>
      </div>

      <p className="mt-6 flex items-center justify-center gap-1.5 text-[12px] text-foreground/45">
        <span className="grid size-4 place-items-center rounded-full border border-black/[0.08] bg-white">
          <Clock className="size-2.5" strokeWidth={2.2} />
        </span>
        = coming soon · drag to turn the globe
      </p>

      {/* The globe is decorative; this is the same list for screen readers. */}
      <ul className="sr-only">
        {INTEGRATIONS.map((item) => (
          <li key={item.name}>
            {item.name}: {item.live ?? "coming soon"}
          </li>
        ))}
      </ul>
    </section>
  );
}
