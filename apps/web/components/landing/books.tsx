"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

// The ideas Todalo is built on. Each line says where the idea lives in the app.
// Each card is the cover in black and white, with only its reds kept (pre-processed in the jpgs).
const BOOKS = [
  { title: "Atomic Habits", cover: "atomic-habits", author: "James Clear", idea: "Goals become time blocks you can do this week, so small wins compound." },
  { title: "Deep Work", cover: "deep-work", author: "Cal Newport", idea: "Focus blocks guard long, quiet stretches for the work that matters." },
  { title: "Flow", cover: "flow", author: "Mihaly Csikszentmihalyi", idea: "Each block holds one thing, with the goal it serves right beside it." },
  { title: "The 12 Week Year", cover: "12-week-year", author: "Brian P. Moran", idea: "Plans run in twelve-week seasons, short enough to feel the deadline." },
  { title: "Getting Things Done", cover: "getting-things-done", author: "David Allen", idea: "Ramble what's on your mind and Todalo files it, so your head stays clear." },
  { title: "Essentialism", cover: "essentialism", author: "Greg McKeown", idea: "A season holds only a handful of goals. Everything else waits." },
  { title: "Peak", cover: "peak", author: "Anders Ericsson", idea: "The weekly review rates every goal, and the Coach tunes the week ahead." },
  { title: "The ONE Thing", cover: "the-one-thing", author: "Gary Keller", idea: "Primary goals get planned first, before the week fills up." },
  { title: "Indistractable", cover: "indistractable", author: "Nir Eyal", idea: "Timeboxing on your calendar turns intentions into commitments." },
  { title: "The 80/20 Principle", cover: "80-20-principle", author: "Richard Koch", idea: "A few things drive most results, so the plan starts with those." },
  { title: "Four Thousand Weeks", cover: "four-thousand-weeks", author: "Oliver Burkeman", idea: "Your time is finite. Todalo shows what fits, not an endless list." },
  { title: "The Power of Now", cover: "power-of-now", author: "Eckhart Tolle", idea: "Today is all you have to look at. The rest of the season waits its turn." },
] as const;

// One full ring of the twelve books, 30deg apart. Its near side reaches out to just in front of
// you (fitted to the reference), so the cards at the sides grow and sweep past the screen edges.
const STEP = 30;
const SLOTS = 360 / STEP;
const AUTO = 0.16; // slots per second
const mod = (n: number, m: number) => ((n % m) + m) % m;
/** Signed slot distance of slot i from the front, in [-SLOTS/2, SLOTS/2). */
const offset = (i: number, rot: number) => mod(i - rot + SLOTS / 2, SLOTS) - SLOTS / 2;
const frontBook = (rot: number) => mod(Math.round(rot), SLOTS) % BOOKS.length;

function place(d: number) {
  return {
    transform: `translateZ(var(--r)) rotateY(${-d * STEP}deg) translateZ(calc(var(--r) * -1))`,
    visibility: Math.abs(d) > 3.6 ? "hidden" : "visible",
  } as const;
}

export function Books() {
  const ring = useRef<HTMLDivElement>(null);
  const cards = useRef<(HTMLDivElement | null)[]>([]);
  const state = useRef({ rot: 0, vel: AUTO, target: null as number | null, paused: false });
  const [front, setFront] = useState(0);

  useEffect(() => {
    const el = ring.current!;
    const s = state.current;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Width of one slot at the front, as a share of W (the section's --W).
    const slotPx = () => Math.max(760, innerWidth) * 0.134; // keep in step with --W
    let raf = 0;
    let last = performance.now();
    let visible = false;
    let drag: { x: number; t: number; moved: number; slot: number | null } | null = null;

    const draw = () => {
      cards.current.forEach((card, i) => {
        const p = place(offset(i, s.rot));
        card!.style.transform = p.transform;
        card!.style.visibility = p.visibility;
      });
      setFront(frontBook(s.rot));
    };

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!drag) {
        if (s.target !== null) {
          s.rot += (s.target - s.rot) * Math.min(1, dt * 6);
          if (Math.abs(s.target - s.rot) < 0.002) {
            s.rot = s.target;
            s.target = null;
            s.vel = 0;
          }
        } else {
          const auto = still || s.paused ? 0 : AUTO;
          s.vel += (auto - s.vel) * Math.min(1, dt * 2);
          s.rot += s.vel * dt;
        }
      }
      draw();
      raf = visible ? requestAnimationFrame(tick) : 0;
    };
    const wake = () => {
      if (raf || !visible) return;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };

    // Only spin while on screen.
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      wake();
    });
    io.observe(el);

    const goTo = (slot: number) => {
      s.target = s.rot + offset(slot, s.rot);
      wake();
    };
    const onDown = (e: PointerEvent) => {
      const slot = (e.target as Element).closest<HTMLElement>("[data-slot]")?.dataset.slot;
      drag = { x: e.clientX, t: performance.now(), moved: 0, slot: slot === undefined ? null : Number(slot) };
      s.target = null;
      el.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const now = performance.now();
      const delta = -dx / slotPx();
      s.rot += delta;
      // Flick momentum, capped so a fast fling coasts a book or two rather than spinning the ring.
      s.vel = Math.max(-4, Math.min(4, delta / Math.max(0.008, (now - drag.t) / 1000)));
      drag.moved += Math.abs(dx);
      drag.x = e.clientX;
      drag.t = now;
      wake();
    };
    const onUp = () => {
      if (drag && drag.moved < 6 && drag.slot !== null) goTo(drag.slot);
      drag = null;
    };
    // Sideways wheels and trackpads turn the ring; vertical scrolling stays with the page.
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      s.target = null;
      s.rot += e.deltaX / slotPx();
      s.vel = 0;
      wake();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      goTo(Math.round(s.target ?? s.rot) + (e.key === "ArrowRight" ? 1 : -1));
    };
    // Auto-rotation pauses while you're reading it (hover or focus).
    const pause = (paused: boolean) => () => (s.paused = paused);
    const listeners = [
      ["pointerdown", onDown],
      ["pointermove", onMove],
      ["pointerup", onUp],
      ["pointercancel", onUp],
      ["keydown", onKey],
      ["pointerenter", pause(true)],
      ["pointerleave", pause(false)],
      ["focusin", pause(true)],
      ["focusout", pause(false)],
    ] as const;
    listeners.forEach(([type, fn]) => el.addEventListener(type, fn as EventListener));
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      listeners.forEach(([type, fn]) => el.removeEventListener(type, fn as EventListener));
      el.removeEventListener("wheel", onWheel);
    };
  }, []);

  return (
    <section
      id="books"
      aria-labelledby="books-title"
      className="relative w-full overflow-x-clip pb-24 pt-24 [--W:max(760px,100vw)] [--p:calc(var(--W)/2)] [--r:calc(var(--W)*0.2439)] md:pb-36 md:pt-36"
    >
      <div className="landing-reveal relative z-10 mx-auto -mt-6 max-w-5xl px-6 pt-6 text-center">
        <h2 id="books-title" className="font-display text-[clamp(2.4rem,5vw,4.25rem)] leading-[0.77] tracking-[-0.01em]">
          <span className="block font-black">The leading productivity books,</span>
          <span className="block font-thin">built into one app.</span>
        </h2>
        <p className="mx-auto mt-6 max-w-md text-[15px] leading-relaxed text-foreground/55 md:text-base">
          Their best techniques, made part of how you plan, focus and review.
        </p>
      </div>

      {/* The ring. Cards sit on the inside of a cylinder around the viewer; see place(). */}
      <div
        ref={ring}
        role="region"
        aria-roledescription="carousel"
        aria-label="Books. Use the arrow keys to turn."
        tabIndex={0}
        className="landing-reveal-soft relative -mt-[calc(var(--W)*0.03)] h-[calc(var(--W)*0.36)] cursor-grab touch-pan-y select-none outline-none [perspective:var(--p)] active:cursor-grabbing"
      >
        {/* A soft warm glow behind the front cards, and its haze on the floor below them. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -inset-y-[20%]"
          style={{
            background:
              "radial-gradient(ellipse calc(var(--W)*0.26) calc(var(--W)*0.22) at 50% 50%, color-mix(in oklab, var(--brand) 16%, transparent), color-mix(in oklab, var(--brand) 5%, transparent) 45%, transparent 75%), radial-gradient(ellipse calc(var(--W)*0.3) calc(var(--W)*0.05) at 50% 70%, color-mix(in oklab, var(--brand) 12%, transparent), transparent 75%)",
          }}
        />
        {Array.from({ length: SLOTS }, (_, i) => {
          const book = BOOKS[i % BOOKS.length];
          const p = place(offset(i, 0));
          return (
            <div
              key={i}
              ref={(node) => void (cards.current[i] = node)}
              data-slot={i}
              aria-hidden
              className="absolute left-1/2 top-1/2 -ml-[calc(var(--W)*0.061)] -mt-[calc(var(--W)*0.0885)] h-[calc(var(--W)*0.177)] w-[calc(var(--W)*0.122)] overflow-hidden rounded-[calc(var(--W)*0.011)] bg-[#121211] shadow-[0_30px_60px_-30px_rgba(0,0,0,0.55)] [backface-visibility:hidden] will-change-transform"
              style={{ transform: p.transform, visibility: p.visibility } as CSSProperties}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- small static cover inside a 3D-transformed card */}
              <img src={`/landing/books/${book.cover}.jpg`} alt="" draggable={false} className="absolute inset-0 size-full object-cover" />
              {/* A fine screen grid over every cover. */}
              <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,rgba(0,0,0,0.07)_0_1px,transparent_1px_3px),repeating-linear-gradient(90deg,rgba(0,0,0,0.05)_0_1px,transparent_1px_3px)]" />
            </div>
          );
        })}
      </div>

      <ul className="sr-only">
        {BOOKS.map((book) => (
          <li key={book.title}>
            {book.title} by {book.author}. {book.idea}
          </li>
        ))}
      </ul>
      {/* Only the front book is described; keyed by title so each new book fades in. */}
      <div
        aria-hidden
        key={BOOKS[front].title}
        className="relative z-10 mx-auto mt-[calc(var(--W)*0.02)] max-w-sm px-6 text-center animate-in fade-in slide-in-from-bottom-1 duration-500 motion-reduce:animate-none"
      >
        <p className="text-[15px] font-medium leading-snug text-foreground md:text-[17px]">
          {BOOKS[front].title}
          <br />
          <span className="font-normal text-foreground/55">{BOOKS[front].author}</span>
        </p>
        <p className="mx-auto mt-2 max-w-[17rem] text-[12px] leading-relaxed text-foreground/55 md:text-[13px]">{BOOKS[front].idea}</p>
      </div>
      <p className="mt-12 text-center text-[11px] text-foreground/35">Not affiliated with the books or their authors.</p>
    </section>
  );
}
