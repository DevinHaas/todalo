import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { FOUNDING_MEMBERS } from "@todalo/server/members";
import { MembershipCard } from "./membership-card";

/** After Pricing: every member's badge, grown from their member number. `next` is the number the next sign-up gets. */
export function Membership({ next }: { next: number }) {
  const founding = next <= FOUNDING_MEMBERS;
  const left = FOUNDING_MEMBERS - next + 1;
  const number = `#${String(next).padStart(4, "0")}`;
  return (
    <section id="membership" aria-labelledby="membership-title" className="relative mx-auto w-full max-w-6xl scroll-mt-6 px-6 pb-24 md:pb-36">
      <div className="grid items-center gap-14 md:grid-cols-[1fr_auto] md:gap-20">
        <div className="landing-reveal max-w-xl">
          <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-foreground/45">Membership</p>
          <h2 id="membership-title" className="mt-4 font-display text-[clamp(2.4rem,5vw,4.25rem)] leading-[0.77] tracking-[-0.01em]">
            <span className="block font-black">Every member</span>
            <span className="block font-thin">gets a tree.</span>
          </h2>
          <p className="mt-6 max-w-md text-[15px] leading-relaxed text-foreground/60">
            When you join, Todalo grows a bonsai from your member number. No two are alike, and yours never changes.
            {founding && ` The first ${FOUNDING_MEMBERS} members carry the Founding member mark.`}
          </p>
          <p className="mt-6 text-[13px] text-foreground/50">
            {number} is next{founding ? ` · ${left} founding ${left === 1 ? "spot" : "spots"} left` : ""}
          </p>
          <Link href="/login?mode=signup" className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-foreground px-5 py-2.5 text-[14px] font-medium text-background transition-opacity hover:opacity-85">
            Get your unique tree <ArrowRight className="size-3.5" />
          </Link>
        </div>
        {/* the soft reveal: landing-reveal ends on filter: blur(0), and any filter on an ancestor flattens the card's 3D tilt in WebKit */}
        <div className="landing-reveal-soft flex justify-center">
          <MembershipCard member={next} founding={founding} />
        </div>
      </div>
    </section>
  );
}
