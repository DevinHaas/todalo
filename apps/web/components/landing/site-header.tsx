import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

const NAV = [
  { href: "/#features", label: "Features" },
  { href: "/#pricing", label: "Pricing" },
];

/** The Todalo bonsai mark (public/todalo-logo.svg, black lines) and the wordmark. `inverted` turns it white for the dark footer. */
export function Logo({ inverted = false }: { inverted?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2 font-display text-[24px] font-thin leading-none tracking-[-0.005em]">
      {/* eslint-disable-next-line @next/next/no-img-element -- small static SVG mark */}
      <img src="/todalo-logo.svg" alt="" width={893} height={772} className={"h-7 w-auto " + (inverted ? "invert" : "")} />
      todalo
    </Link>
  );
}

export function SiteHeader({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="relative z-30 mx-auto flex w-full max-w-6xl items-center justify-between md:grid md:grid-cols-[1fr_auto_1fr] px-6 py-6">
      <Logo />

      <nav
        aria-label="Main"
        className="hidden items-center gap-1 rounded-full border border-black/[0.06] bg-white/60 p-1 text-[13px] shadow-[0_1px_2px_rgba(0,0,0,0.04)] backdrop-blur md:flex"
      >
        {NAV.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="rounded-full px-4 py-1.5 text-foreground/80 transition-colors hover:bg-white hover:text-foreground hover:shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
          >
            {item.label}
          </a>
        ))}
      </nav>

      <div className="flex items-center justify-end gap-5 text-[13px]">
        {signedIn ? (
          <Link
            href="/today"
            className="inline-flex items-center gap-1.5 rounded-full bg-brand-strong px-4 py-2 font-medium text-white transition-opacity hover:opacity-90"
          >
            Open Todalo <ArrowUpRight className="size-3.5" />
          </Link>
        ) : (
          <>
            <Link href="/login" className="text-foreground/70 transition-colors hover:text-foreground">
              Log in
            </Link>
            <Link
              href="/login?mode=signup"
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-strong px-4 py-2 font-medium text-white transition-opacity hover:opacity-90"
            >
              Get started <ArrowUpRight className="size-3.5" />
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
