import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  CalendarRange,
  ChartColumn,
  ChartPie,
  Clock,
  Gauge,
  Inbox,
  Lightbulb,
  Play,
  Tag,
  Target,
  TrendingUp,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Card building blocks, modelled on the Mindly reference.             */
/* ------------------------------------------------------------------ */

function Chip({ children, accent = false }: { children: ReactNode; accent?: boolean }) {
  return (
    <span
      className={
        "grid size-7 shrink-0 place-items-center rounded-[9px] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] " +
        (accent ? "bg-brand/12 text-brand-strong" : "bg-black/[0.05] text-foreground/80")
      }
    >
      {children}
    </span>
  );
}

function CardHead({ icon, title, sub, accent }: { icon: ReactNode; title: string; sub: string; accent?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <Chip accent={accent}>{icon}</Chip>
      <div className="leading-tight">
        <div className="text-[13px] font-medium text-foreground">{title}</div>
        <div className="text-[10.5px] text-foreground/50">{sub}</div>
      </div>
    </div>
  );
}

/* --- Simplified feature visualisations (not app screenshots) ------- */

function SeasonViz() {
  return (
    <div className="mt-3 flex gap-1" aria-hidden>
      {Array.from({ length: 12 }, (_, i) => (
        <span
          key={i}
          className={
            "h-1.5 flex-1 rounded-full " +
            (i < 5 ? "bg-foreground/75" : i === 5 ? "bg-brand" : "bg-foreground/10")
          }
        />
      ))}
    </div>
  );
}

function GoalsViz() {
  const goals = [
    { w: "w-[78%]", done: true },
    { w: "w-[60%]", done: false },
    { w: "w-[70%]", done: false },
  ];
  return (
    <div className="mt-3 space-y-1.5" aria-hidden>
      {goals.map((g, i) => (
        <div key={i} className="flex items-center gap-2">
          <span
            className={
              "grid size-3 place-items-center rounded-full border " +
              (g.done ? "border-brand bg-brand" : "border-foreground/25")
            }
          >
            {g.done && <span className="block size-1 rounded-full bg-white" />}
          </span>
          <span className={"h-1.5 rounded-full " + g.w + (g.done ? " bg-foreground/20" : " bg-foreground/10")} />
        </div>
      ))}
    </div>
  );
}

function BlocksViz() {
  return (
    <div className="mt-3 grid grid-cols-[14px_1fr] gap-x-2 gap-y-1 text-[8.5px] text-foreground/40" aria-hidden>
      <span>9</span>
      <span className="rounded-[5px] border-l-2 border-brand bg-brand/10 px-1.5 py-1 text-[9px] font-medium text-foreground/70">
        Deep work
      </span>
      <span>11</span>
      <span className="h-px self-center bg-foreground/10" />
      <span>14</span>
      <span className="rounded-[5px] border-l-2 border-foreground/50 bg-foreground/[0.06] px-1.5 py-1 text-[9px] font-medium text-foreground/70">
        Goal · write
      </span>
    </div>
  );
}

function ReviewViz() {
  const r = 14;
  const c = 2 * Math.PI * r;
  return (
    <div className="mt-3 flex items-end justify-between" aria-hidden>
      <svg viewBox="0 0 36 36" className="size-9 -rotate-90">
        <circle cx="18" cy="18" r={r} fill="none" stroke="currentColor" strokeOpacity="0.1" strokeWidth="4" />
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          stroke="var(--brand)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${c * 0.68} ${c}`}
        />
      </svg>
      <div className="flex h-8 items-end gap-1">
        {[30, 45, 38, 60, 52, 75, 68].map((h, i) => (
          <span key={i} className="w-1.5 rounded-full bg-foreground/20 last:bg-foreground/70" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Two rings (levels) around the head, leaving the face clear between  */
/* them: a small one above the hair, a wide one at neck and shoulders. */
/* Each ring is a tilted cylinder and every card bends with it: a card */
/* is cut into thin vertical slices, each slice placed at its own      */
/* angle (rotateY + translateZ). The rings share the portrait's        */
/* preserve-3d scene, so the browser depth-sorts them: the front       */
/* covers the person, the back hides behind the head.                  */
/* ------------------------------------------------------------------ */

/* --- Extra cards for the ring's sides and back: stats, insights, progress, labels,
   inbox. Only things Todalo has or the season review shows, nothing invented. --- */

function InsightViz() {
  return (
    <div className="mt-2.5 rounded-lg bg-foreground/[0.05] px-2 py-1.5 text-[9.5px] leading-snug text-foreground/70" aria-hidden>
      You finish most on <span className="font-medium text-foreground">Tue mornings</span>.
    </div>
  );
}

function StatsViz() {
  return (
    <div className="mt-2.5 grid grid-cols-2 gap-2" aria-hidden>
      <div>
        <div className="text-[15px] font-medium leading-none tracking-tight">42</div>
        <div className="mt-0.5 text-[8.5px] text-foreground/50">tasks done</div>
      </div>
      <div>
        <div className="text-[15px] font-medium leading-none tracking-tight">86%</div>
        <div className="mt-0.5 text-[8.5px] text-foreground/50">goals on track</div>
      </div>
    </div>
  );
}

function ProductivityViz() {
  return (
    <div className="mt-2 flex items-end justify-between" aria-hidden>
      <span className="text-[17px] font-medium leading-none tracking-tight text-brand-strong">+23%</span>
      <svg viewBox="0 0 60 24" className="h-6 w-14" fill="none">
        <path d="M1 20 L12 16 L22 18 L33 10 L44 12 L59 3" stroke="currentColor" strokeOpacity="0.55" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function PillsViz() {
  return (
    <div className="mt-2.5 flex flex-wrap gap-1" aria-hidden>
      {["deep", "home", "health"].map((l, i) => (
        <span key={l} className={"rounded-full px-1.5 py-0.5 text-[8.5px] " + (i === 0 ? "bg-brand/12 text-brand-strong" : "bg-foreground/[0.06] text-foreground/60")}>
          {l}
        </span>
      ))}
    </div>
  );
}

function WeekViz() {
  return (
    <div className="mt-2.5 flex h-7 items-end gap-1.5" aria-hidden>
      {[40, 75, 55, 90, 65, 30, 20].map((h, i) => (
        <span key={i} className={"flex-1 rounded-[3px] " + (i === 3 ? "bg-brand" : "bg-foreground/15")} style={{ height: `${h}%` }} />
      ))}
    </div>
  );
}

function InboxViz() {
  return (
    <div className="mt-3 flex items-center gap-2 text-[10px] text-foreground/50" aria-hidden>
      <span className="grid size-4 place-items-center rounded-full bg-foreground/80 text-[8px] text-white">✓</span>
      All clear for today
    </div>
  );
}

const fake = (icon: ReactNode, title: string, sub: string, viz: ReactNode) => (
  <>
    <CardHead icon={icon} title={title} sub={sub} />
    {viz}
  </>
);

const SLICES = 8;

// One cylinder around the head with two stacked rows (eye level and mouth level), so both
// rows share the exact same tilt. The face points front-left, so the arc from about -22°
// to +4° stays empty in both rows: eyes, nose and mouth sit in that gap, like the reference.
const RING = {
  radius: 390,
  rowHeight: 112,
  rowGap: 12,
  left: "55%",
  top: "34%",
  tilt: "rotateX(-9deg) rotateZ(7deg)",
};

// dy: a few px of vertical jitter so the band doesn't read as a rigid grid
type RingCardItem = { angle: number; row: 0 | 1; width: number; delay: number; dy?: number } & (
  | { kind: "feature"; node: ReactNode }
  | { kind: "image"; src: string }
);

const tile = (name: string) => `/landing/tiles/${name}.webp`;

const ITEMS: RingCardItem[] = [
  // features, readable story order: top-left → top-right → bottom-left → bottom-right
  {
    kind: "feature",
    row: 0,
    angle: -38,
    width: 180,
    dy: -7,
    delay: 0,
    node: (
      <>
        <CardHead accent icon={<CalendarRange className="size-3.5" />} title="Season" sub="Week 6 of 12" />
        <SeasonViz />
      </>
    ),
  },
  {
    kind: "feature",
    row: 0,
    angle: 18,
    width: 170,
    dy: 4,
    delay: 1.2,
    node: (
      <>
        <CardHead icon={<Target className="size-3.5" />} title="Goals" sub="3 for this season" />
        <GoalsViz />
      </>
    ),
  },
  {
    kind: "feature",
    row: 1,
    angle: -32,
    width: 160,
    dy: 9,
    delay: 2.1,
    node: (
      <>
        <CardHead icon={<Clock className="size-3.5" />} title="Time blocks" sub="Today" />
        <BlocksViz />
      </>
    ),
  },
  {
    kind: "feature",
    row: 1,
    angle: 24,
    width: 180,
    dy: -3,
    delay: 0.6,
    node: (
      <>
        <CardHead icon={<TrendingUp className="size-3.5" />} title="Review" sub="Season progress" />
        <ReviewViz />
      </>
    ),
  },
  // images and decorative cards spread around both rows, alternating
  { kind: "image", row: 0, src: tile("moon"), angle: 48, width: 120, delay: 1.6, dy: -4 },
  { kind: "image", row: 0, src: tile("lake"), angle: 84, width: 150, delay: 0.4, dy: 6 },
  { kind: "feature", row: 0, angle: 128, width: 140, delay: 2.4, node: fake(<Lightbulb className="size-3.5" />, "Insights", "From your season", <InsightViz />) },
  { kind: "feature", row: 0, angle: 168, width: 150, delay: 1.3, dy: -5, node: fake(<ChartPie className="size-3.5" />, "Stats", "This season", <StatsViz />) },
  { kind: "image", row: 0, src: tile("dunes"), angle: -70, width: 140, delay: 1.1, dy: 5 },
  { kind: "feature", row: 0, angle: -138, width: 140, delay: 0.7, node: fake(<Tag className="size-3.5" />, "Labels", "3 active", <PillsViz />) },
  { kind: "image", row: 1, src: tile("stones"), angle: 52, width: 140, delay: 0.9, dy: 6 },
  { kind: "feature", row: 1, angle: 92, width: 140, delay: 1.9, dy: -4, node: fake(<Gauge className="size-3.5" />, "Productivity", "vs. last season", <ProductivityViz />) },
  { kind: "image", row: 1, src: tile("ripple"), angle: 140, width: 150, delay: 2.2 },
  { kind: "feature", row: 1, angle: -172, width: 140, delay: 0.5, dy: 4, node: fake(<Inbox className="size-3.5" />, "Inbox", "Zero", <InboxViz />) },
  { kind: "image", row: 1, src: tile("pine"), angle: -60, width: 120, delay: 0.2, dy: -6 },
  { kind: "feature", row: 1, angle: -112, width: 150, delay: 1.5, dy: 3, node: fake(<ChartColumn className="size-3.5" />, "This week", "Planned hours", <WeekViz />) },
];

// no backdrop-blur: per-slice blur shows seams; a denser white reads the same
const GLASS_FACE = "rounded-[18px] border border-white/90 bg-gradient-to-b from-white/95 to-white/75 p-3.5";
const IMAGE_FACE = "overflow-hidden rounded-[18px] border border-white/70 bg-neutral-300";

function CurvedCard({ item }: { item: RingCardItem }) {
  const { radius, rowHeight, rowGap } = RING;
  const sliceW = item.width / SLICES;
  const y = ((item.row === 0 ? -1 : 1) * (rowHeight + rowGap)) / 2 + (item.dy ?? 0);
  // Cards on the far side are seen from inside the ring; mirror them so they read the right way round.
  const back = Math.cos((item.angle * Math.PI) / 180) < 0;
  const face = (
    <div
      className={item.kind === "image" ? IMAGE_FACE : GLASS_FACE}
      style={{ width: item.width, height: rowHeight, transform: back ? "scaleX(-1)" : undefined }}
    >
      {item.kind === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element -- tiny decorative tile, repeated per slice inside a 3D scene
        <img src={item.src} alt="" className="size-full object-cover grayscale" loading="lazy" decoding="async" />
      ) : (
        item.node
      )}
    </div>
  );
  return (
    <div
      className="absolute left-0 top-0 [transform-style:preserve-3d] motion-safe:animate-float"
      style={{ animationDelay: `${item.delay}s` }}
    >
      {Array.from({ length: SLICES }, (_, i) => {
        const along = (i + 0.5) * sliceW - item.width / 2; // px along the arc from the card centre
        const angle = item.angle + (along / radius) * (180 / Math.PI);
        return (
          <div
            key={i}
            className="absolute overflow-hidden"
            style={{
              // opaque tiles get a hairline overlap to hide seams; translucent glass would show it doubled
              width: item.kind === "image" ? sliceW + 0.6 : sliceW,
              height: rowHeight,
              transform: `translate(-50%, -50%) translateY(${y}px) rotateY(${angle}deg) translateZ(${radius}px)`,
            }}
          >
            <div style={{ marginLeft: -i * sliceW }}>{face}</div>
          </div>
        );
      })}
    </div>
  );
}

function Portrait() {
  return (
    <div className="pointer-events-none absolute bottom-0 left-1/2 h-[500px] w-[530px] -translate-x-1/2 origin-bottom [perspective:1900px] max-md:scale-[0.62] md:max-lg:[scale:calc(0.85*var(--portrait))] lg:[scale:var(--portrait)]">
      <div className="relative size-full [transform-style:preserve-3d]">
        {/* eslint-disable-next-line @next/next/no-img-element -- static cutout; next/image can't sit inside a 3D scene's depth sort */}
        <img
          src="/landing/hero-person.webp"
          alt=""
          width={1600}
          height={1506}
          fetchPriority="high"
          className="absolute bottom-0 left-0 w-full [transform:translateZ(0)]"
        />
        <div
          className="absolute [transform-style:preserve-3d]"
          style={{ left: RING.left, top: RING.top, transform: RING.tilt }}
          aria-hidden
        >
          {ITEMS.map((item, i) => (
            <CurvedCard key={i} item={item} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function Hero() {
  return (
    <section className="relative mx-auto w-full max-w-6xl px-6 md:flex md:flex-1 md:flex-col">
      <div className="relative z-20 mx-auto max-w-5xl pt-6 text-center md:pt-8">
        {/* line-height 0.77: the tightest value where no letters collide (measured) */}
        <h1 className="font-display text-[clamp(2.6rem,6.6vw,5.75rem)] leading-[0.77] [&>span]:whitespace-nowrap tracking-[-0.01em]">
          <span className="block font-black">Plan your season.</span>
          <span className="block font-thin">Let the rest flow.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-md text-[15px] leading-relaxed text-foreground/55 md:text-base">
          Split your year into seasons. Each one gets a handful of goals and your full focus, until the next one begins.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/login?mode=signup"
            className="inline-flex items-center gap-2 rounded-full bg-brand-strong px-6 py-3 text-[14px] font-medium text-white shadow-[0_8px_20px_-8px_var(--brand-strong)] transition-opacity hover:opacity-90"
          >
            Get started <ArrowRight className="size-4" />
          </Link>
          <a
            href="#features"
            className="inline-flex items-center gap-2.5 rounded-full border border-black/[0.08] bg-white/70 py-2 pl-2 pr-5 text-[14px] font-medium backdrop-blur transition-colors hover:bg-white"
          >
            <span className="grid size-7 place-items-center rounded-full bg-foreground text-white">
              <Play className="size-3 fill-white" />
            </span>
            See how it works
          </a>
        </div>
      </div>

      {/* From md the portrait shrinks with short viewports so its base stays on the fold. */}
      <div
        className="relative mt-10 h-[330px] md:mt-12 md:h-auto md:min-h-[calc(490px*var(--portrait))] md:flex-1"
        style={{ "--portrait": "clamp(0.6, calc((100svh - 420px) / 490), 1)" } as React.CSSProperties}
      >
        <Portrait />
      </div>
    </section>
  );
}
