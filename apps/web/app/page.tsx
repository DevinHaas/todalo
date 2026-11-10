import type { Metadata } from "next";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { sanela } from "@/components/landing/fonts";
import { SiteHeader } from "@/components/landing/site-header";
import { Hero } from "@/components/landing/hero";
import { Features } from "@/components/landing/features";
import { Integrations } from "@/components/landing/integrations";
import { Pricing } from "@/components/landing/pricing";
import { Closing } from "@/components/landing/closing";
import { foundersLeft } from "@/lib/founders";

export const metadata: Metadata = {
  title: "Todalo · Plan your season. Let the rest flow.",
  description: "Set a season, pick your goals, block the time. Todalo keeps the plan, you keep the calm.",
};

export default async function LandingPage() {
  // Signed-in visitors still see the landing page; the header swaps to "Open Todalo".
  const [session, left] = await Promise.all([auth.api.getSession({ headers: await headers() }), foundersLeft()]);

  return (
    <div className={`${sanela.variable} min-h-screen overflow-x-clip bg-[#f5f4f1] text-foreground`}>
      <main>
        {/* The header and hero fill the viewport, so the portrait stands on the fold and only the top of the next section shows (mobile: ~10px of its label; desktop: nothing). */}
        <div className="flex min-h-[calc(100svh-122px)] flex-col md:min-h-svh">
          <SiteHeader signedIn={Boolean(session)} />
          <Hero />
        </div>
        <Features />
        <Integrations />
        <Pricing foundersLeft={left} />
      </main>
      <Closing signedIn={Boolean(session)} />
    </div>
  );
}
