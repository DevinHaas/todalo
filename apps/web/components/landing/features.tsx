"use client";

import { useEffect, useRef, useState } from "react";

// Real captures of the app (scripts/landing-capture.cjs), one per step, in story order.
const STEPS = [
  {
    clip: "season-setup",
    title: "Set up your season.",
    copy: "Say what the season is about and how long it runs. The Coach turns it into a few measurable goals, then asks where you're starting from, so progress is measured from there.",
  },
  {
    clip: "ramble",
    title: "Say it, then add it.",
    copy: "Talk through everything on your mind. Todalo turns each thing into a task with its date and time, and nothing is saved until you tap Add.",
  },
  {
    clip: "coach-plan",
    title: "Plan the week with the Coach.",
    copy: "Ask in the command bar and the Coach drafts your week around your goals, primary ones first. Keep what fits, drop what doesn't, then drag any block to where you want it.",
  },
  {
    clip: "review",
    title: "Review, then steer.",
    copy: "Each week, see what moved, rate every goal and add a line of context. Your ratings set the season's trajectory and shape what the Coach suggests next.",
  },
] as const;

const src = (clip: string, ext: "mp4" | "webp") => `/landing/features/${clip}.${ext}`;

function Clip({ clip, playing, className = "" }: { clip: string; playing: boolean; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    // Only the clip in view plays; reduced motion keeps the poster.
    if (playing && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      video.currentTime = 0;
      video.play().catch(() => {});
    } else video.pause();
  }, [playing]);
  return (
    <video
      ref={ref}
      src={src(clip, "mp4")}
      poster={src(clip, "webp")}
      muted
      loop
      playsInline
      preload="none"
      aria-hidden
      width={1200}
      height={1000}
      className={"block aspect-[6/5] w-full rounded-[12px] bg-white object-cover ring-1 ring-black/[0.06] " + className}
    />
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={
        "rounded-[18px] border border-white/90 bg-gradient-to-b from-white/95 to-white/75 p-2 shadow-[0_24px_60px_-28px_rgba(0,0,0,0.25),0_1px_2px_rgba(0,0,0,0.04)] " +
        className
      }
    >
      {children}
    </div>
  );
}

export function Features() {
  const [active, setActive] = useState(0);
  const [visible, setVisible] = useState<boolean[]>(() => STEPS.map(() => false));
  const steps = useRef<(HTMLElement | null)[]>([]);
  const inline = useRef<(HTMLDivElement | null)[]>([]);

  // Desktop: the step crossing the middle of the viewport picks the sticky clip.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.step));
      },
      { rootMargin: "-50% 0px -50% 0px" },
    );
    steps.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, []);

  // Mobile: each stacked clip plays while it's on screen.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) =>
        setVisible((prev) => {
          const next = [...prev];
          for (const entry of entries) next[Number((entry.target as HTMLElement).dataset.step)] = entry.isIntersecting;
          return next;
        }),
      { threshold: 0.4 },
    );
    inline.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const query = matchMedia("(min-width: 768px)");
    const update = () => setDesktop(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return (
    <section id="features" aria-labelledby="features-title" className="relative mx-auto w-full max-w-6xl scroll-mt-6 px-6 pb-24 pt-28 md:pb-40 md:pt-40">
      <div className="landing-reveal max-w-xl">
        <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-foreground/45">How it works</p>
        {/* line-height 0.77 as in the hero: no descenders in line one, so the lines can nearly touch */}
        <h2 id="features-title" className="mt-4 font-display text-[clamp(2.4rem,5vw,4.25rem)] leading-[0.77] tracking-[-0.01em]">
          <span className="block font-black">One season.</span>
          <span className="block font-thin">Four calm steps.</span>
        </h2>
      </div>

      <div className="mt-14 md:mt-20 md:grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-16 lg:gap-24">
        <ol>
          {STEPS.map((step, i) => {
            const on = active === i;
            return (
              <li
                key={step.clip}
                ref={(el) => {
                  steps.current[i] = el;
                }}
                data-step={i}
                className="py-10 md:flex md:min-h-[72vh] md:flex-col md:justify-center md:py-0"
              >
                <div
                  className={
                    "landing-reveal border-l pl-5 transition-colors duration-500 md:pl-7 " +
                    (on ? "md:border-brand" : "md:border-black/10") +
                    " border-black/10"
                  }
                >
                  <h3 className="font-display text-[clamp(1.75rem,2.6vw,2.4rem)] font-black leading-[0.95] tracking-[-0.005em]">
                    {step.title}
                  </h3>
                  <p
                    className={
                      "mt-3 max-w-sm text-[15px] leading-relaxed transition-colors duration-500 md:text-base " +
                      (on ? "text-foreground/55" : "text-foreground/55 md:text-foreground/35")
                    }
                  >
                    {step.copy}
                  </p>
                </div>

                {/* Mobile: the clip sits right under its step. */}
                <div
                  ref={(el) => {
                    inline.current[i] = el;
                  }}
                  data-step={i}
                  className="mt-6 md:hidden"
                >
                  <Card>
                    <Clip clip={step.clip} playing={!desktop && visible[i]} />
                  </Card>
                </div>
              </li>
            );
          })}
        </ol>

        {/* Desktop: one sticky card; the clip crossfades to the step in view. */}
        <div className="hidden md:block">
          <div className="sticky top-[max(6rem,calc(50vh-16rem))]">
            <Card>
              <div className="relative">
                {STEPS.map((step, i) => (
                  <div
                    key={step.clip}
                    className={
                      "transition-opacity duration-700 ease-out " + (i === 0 ? "relative " : "absolute inset-0 ") + (active === i ? "opacity-100" : "opacity-0")
                    }
                  >
                    <Clip clip={step.clip} playing={desktop && active === i} />
                  </div>
                ))}
              </div>
            </Card>
            <div className="mt-4 flex items-center justify-center gap-1.5" aria-hidden>
              {STEPS.map((step, i) => (
                <span
                  key={step.clip}
                  className={"h-1 rounded-full transition-all duration-500 " + (active === i ? "w-6 bg-brand" : "w-1.5 bg-black/15")}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
