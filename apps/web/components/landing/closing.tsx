import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Logo } from "./site-header";
import { FooterBand } from "./footer-band";

const INK = "#121211";

/** Closing CTA (brief §2.6): a light section that dissolves into the dark footer. */
export function Closing({ signedIn }: { signedIn: boolean }) {
  return (
    <>
      <section aria-labelledby="closing-title" className="relative mx-auto w-full max-w-6xl px-6 pb-20 pt-24 text-center md:pb-28 md:pt-32">
        <h2 id="closing-title" className="landing-reveal font-display text-[clamp(2.6rem,6vw,5.25rem)] leading-[0.77] tracking-[-0.01em]">
          <span className="block font-black">Your next season</span>
          <span className="block font-thin">starts today.</span>
        </h2>
        <p className="landing-reveal mx-auto mt-6 max-w-md text-[15px] leading-relaxed text-foreground/55 md:text-base">
          Twelve weeks, a few goals that matter, and time set aside for them. Free to start.
        </p>
        <div className="landing-reveal mt-7 flex flex-wrap items-center justify-center gap-3">
          <Link
            href={signedIn ? "/today" : "/login?mode=signup"}
            className="landing-cta inline-flex items-center gap-2 rounded-full bg-brand-strong px-6 py-3 text-[14px] font-medium text-white shadow-[0_8px_20px_-8px_var(--brand-strong)] transition-opacity hover:opacity-90"
          >
            {signedIn ? (
              <>
                Open Todalo <ArrowUpRight className="size-4" />
              </>
            ) : (
              <>
                Get started <ArrowRight className="size-4" />
              </>
            )}
          </Link>
        </div>
      </section>

      {/* The dissolve into the footer: a mouse-reactive shader (footer-shader.ts). */}
      <FooterBand />

      <Footer />
    </>
  );
}

/** The dark footer, shared by the landing page and the legal pages. */
export function Footer() {
  return (
      <footer className="text-white/60" style={{ background: INK }}>
        <div className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-10 px-6 pb-12 pt-6 md:grid-cols-[1fr_auto_auto] md:gap-20">
          <div className="col-span-2 text-white md:col-span-1">
            <Logo inverted />
            <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-white/50">Plan your season. Let the rest flow.</p>
          </div>
          <nav aria-label="Product" className="text-[13px]">
            <p className="font-medium text-white/85">Product</p>
            <ul className="mt-3 space-y-2">
              {[
                ["/#features", "Features"],
                ["/#integrations", "Integrations"],
                ["/#pricing", "Pricing"],
              ].map(([href, label]) => (
                <li key={href}>
                  <a href={href} className="transition-colors hover:text-white">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Account" className="text-[13px]">
            <p className="font-medium text-white/85">Account</p>
            <ul className="mt-3 space-y-2">
              <li>
                <Link href="/login" className="transition-colors hover:text-white">
                  Log in
                </Link>
              </li>
              <li>
                <Link href="/login?mode=signup" className="transition-colors hover:text-white">
                  Get started
                </Link>
              </li>
            </ul>
          </nav>
        </div>
        {/* No social links for now (decided 2026-11-10). */}
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 border-t border-white/10 px-6 py-6 text-[12px] text-white/40">
          <span className="flex gap-5">
            © {new Date().getFullYear()} Todalo
            <Link href="/privacy" className="transition-colors hover:text-white">
              Privacy
            </Link>
            <Link href="/terms" className="transition-colors hover:text-white">
              Terms
            </Link>
          </span>
          <a href="https://bleat.ch" target="_blank" rel="noopener" className="group inline-flex items-center gap-1.5 transition-colors hover:text-white">
            <span className="size-1.5 rounded-full bg-brand" />
            Developed by <span className="font-medium tracking-[0.06em] text-white/70 group-hover:text-white">BLEAT</span>
            <ArrowUpRight className="size-3" />
          </a>
        </div>
      </footer>
  );
}
