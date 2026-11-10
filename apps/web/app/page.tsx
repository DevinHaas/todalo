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
      <SiteHeader signedIn={Boolean(session)} />
      <main>
        <Hero />
        <Features />
        <Integrations />
        <Pricing foundersLeft={left} />
      </main>
      <Closing signedIn={Boolean(session)} />
    </div>
  );
}
