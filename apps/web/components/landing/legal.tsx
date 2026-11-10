import type { ReactNode } from "react";
import { sanela } from "./fonts";
import { SiteHeader } from "./site-header";
import { Footer } from "./closing";

/** Privacy and Terms: the landing page's header and footer around a plain reading column. */
export function LegalPage({ title, thin, updated, children }: { title: string; thin: string; updated: string; children: ReactNode }) {
  return (
    <div className={`${sanela.variable} min-h-screen overflow-x-clip bg-[#f5f4f1] text-foreground`}>
      <SiteHeader signedIn={false} />
      <main className="mx-auto w-full max-w-2xl px-6 pb-24 pt-12 md:pt-20">
        <h1 className="font-display text-[clamp(2.4rem,5vw,4rem)] leading-[0.77] tracking-[-0.01em]">
          <span className="block font-black">{title}</span>
          <span className="block font-thin">{thin}</span>
        </h1>
        <p className="mt-6 text-[13px] text-foreground/45">Last updated {updated}</p>
        <div className="mt-10 space-y-8 text-[15px] leading-relaxed text-foreground/70 [&_h2]:mb-2 [&_h2]:text-[15px] [&_h2]:font-medium [&_h2]:text-foreground [&_li]:mt-1.5 [&_ul]:list-disc [&_ul]:pl-5">
          {children}
        </div>
      </main>
      <Footer />
    </div>
  );
}
