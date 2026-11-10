"use client";

import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";

// The ideas Todalo is built on. Each line says where the idea lives in the app.
// Each card is the cover in black and white, with only its reds kept (pre-processed in the jpgs).
const BOOKS = [
  {
    title: "Atomic Habits",
    cover: "atomic-habits",
    author: "James Clear",
    idea: "Small, repeated actions beat big plans. Your goals become time blocks you can actually do this week, so progress compounds.",
  },
  {
    title: "Flow",
    cover: "flow",
    author: "Mihaly Csikszentmihalyi",
    idea: "Flow needs one clear goal and nothing in the way. Each block holds a single thing, with the goal it serves right beside it.",
  },
  {
    title: "Peak",
    cover: "peak",
    author: "Anders Ericsson",
    idea: "You get better through practice with honest feedback. The weekly review rates every goal, and the Coach tunes the week ahead.",
  },
  {
    title: "The 80/20 Principle",
    cover: "80-20-principle",
    author: "Richard Koch",
    idea: "A few things drive most of the results. A season holds only a handful of goals, and the primary ones get planned first.",
  },
  {
    title: "The Power of Now",
    cover: "power-of-now",
    author: "Eckhart Tolle",
    idea: "A clear head lives in the present. Ramble everything on your mind and Todalo files it, so today is all you have to look at.",
  },
] as const;


export function Books() {
  const [active, setActive] = useState(2);
  const swipe = useRef<number | null>(null);
  const go = (i: number) => setActive(Math.max(0, Math.min(BOOKS.length - 1, i)));
  const book = BOOKS[active];

  return (
    <section id="books" aria-labelledby="books-title" className="relative w-full overflow-x-clip py-24 md:py-36">
      <div className="landing-reveal mx-auto max-w-2xl px-6 text-center">
        <h2 id="books-title" className="font-display text-[clamp(2.4rem,5vw,4.25rem)] leading-[0.77] tracking-[-0.01em]">
          <span className="block font-black">The leading productivity books,</span>
          <span className="block font-thin">built into one app.</span>
        </h2>
        <p className="mx-auto mt-6 max-w-md text-[15px] leading-relaxed text-foreground/55 md:text-base">
          Their best techniques, made part of how you plan, focus and review.
        </p>
      </div>

      {/* A shallow arc: the card in front faces you, the others turn in toward it. */}
      <div
        className="landing-reveal-soft relative mx-auto mt-14 h-[clamp(300px,36vw,440px)] touch-pan-y select-none [--card:clamp(200px,22vw,300px)] [--step:clamp(150px,21vw,330px)] [perspective:1400px] md:mt-20"
        onPointerDown={(event) => (swipe.current = event.clientX)}
        onPointerUp={(event) => {
          if (swipe.current === null) return;
          const dx = event.clientX - swipe.current;
          swipe.current = null;
          if (Math.abs(dx) > 40) go(active + (dx < 0 ? 1 : -1));
        }}
        onPointerCancel={() => (swipe.current = null)}
      >
        {BOOKS.map((item, i) => {
          const o = i - active;
          const far = Math.abs(o);
          return (
            <button
              key={item.title}
              type="button"
              onClick={() => go(i)}
              aria-label={`${item.title} by ${item.author}`}
              aria-current={o === 0}
              tabIndex={far > 1 ? -1 : 0}
              className="absolute left-1/2 top-1/2 aspect-[5/7] w-[var(--card)] overflow-hidden rounded-[22px] bg-[#121211] text-left shadow-[0_30px_60px_-30px_rgba(0,0,0,0.55)] outline-none ring-black/20 [backface-visibility:hidden] focus-visible:ring-2 motion-safe:transition-[transform,opacity,filter] motion-safe:duration-700 motion-safe:ease-[cubic-bezier(.2,.7,.2,1)]"
              style={{
                transform: `translate(-50%, -50%) translateX(calc(${o} * var(--step))) translateZ(${-far * 70}px) rotateY(${o * -24}deg) scale(${o === 0 ? 1 : 0.9})`,
                opacity: far > 2 ? 0 : 1,
                filter: o === 0 ? "none" : "brightness(0.82)",
                zIndex: 10 - far,
                pointerEvents: far > 2 ? "none" : "auto",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- small static cover inside a 3D-transformed card */}
              <img
                src={`/landing/books/${item.cover}.jpg`}
                alt=""
                loading="lazy"
                draggable={false}
                className="absolute inset-0 size-full object-cover"
              />
            </button>
          );
        })}
      </div>

      <div className="mx-auto mt-10 flex max-w-xl items-start gap-4 px-6 md:mt-12">
        <button
          type="button"
          onClick={() => go(active - 1)}
          disabled={active === 0}
          aria-label="Previous book"
          className="grid size-9 shrink-0 place-items-center rounded-full border border-black/[0.08] bg-white text-foreground/70 transition-opacity disabled:opacity-35"
        >
          <ArrowLeft className="size-4" />
        </button>
        <p aria-live="polite" className="min-h-[4.5rem] flex-1 text-center text-[15px] leading-relaxed text-foreground/55">
          <span className="font-medium text-foreground">{book.title}.</span> {book.idea}
        </p>
        <button
          type="button"
          onClick={() => go(active + 1)}
          disabled={active === BOOKS.length - 1}
          aria-label="Next book"
          className="grid size-9 shrink-0 place-items-center rounded-full border border-black/[0.08] bg-white text-foreground/70 transition-opacity disabled:opacity-35"
        >
          <ArrowRight className="size-4" />
        </button>
      </div>
      <p className="mt-6 text-center text-[11px] text-foreground/35">Not affiliated with the books or their authors.</p>
    </section>
  );
}
