import type { Metadata } from "next";
import { LegalPage } from "@/components/landing/legal";

export const metadata: Metadata = { title: "Terms · Todalo" };

// Plain-language draft matching the plans in docs/landing brief §3. Have it reviewed before launch.
export default function TermsPage() {
  return (
    <LegalPage title="Terms." thin="The short version." updated="10 November 2026">
      <p>Todalo is run by bleat, based in Switzerland. By using Todalo you agree to these terms. They are written to be read, not skimmed past.</p>
      <section>
        <h2>Your content is yours</h2>
        <p>Everything you put into Todalo stays yours. We only use it to run the service for you.</p>
      </section>
      <section>
        <h2>Plans</h2>
        <ul>
          <li>Free costs nothing and has limits: up to 5 projects, no calendar view, and a small monthly hosted AI allowance.</li>
          <li>Pro is billed monthly or yearly and renews until you cancel. Cancelling keeps Pro until the end of the period you paid for.</li>
          <li>Lifetime is a one-time payment for everything Pro includes, for as long as Todalo runs.</li>
        </ul>
      </section>
      <section>
        <h2>Hosted AI</h2>
        <p>Ramble and the Coach include a monthly allowance on our side, with fair use limits that keep it sustainable. With your own API key there are no limits from us; your provider&apos;s pricing and terms apply.</p>
      </section>
      <section>
        <h2>Fair use</h2>
        <p>Don&apos;t use Todalo to break the law, to harm others, or to overload or probe the service. We may suspend accounts that do.</p>
      </section>
      <section>
        <h2>No guarantees</h2>
        <p>We work hard to keep Todalo running and your data safe, but the service is provided as it is. Keep your own copies of anything you can&apos;t afford to lose.</p>
      </section>
      <section>
        <h2>Law</h2>
        <p>These terms are governed by Swiss law.</p>
      </section>
      <section>
        <h2>Changes</h2>
        <p>If these terms change in a way that matters, we&apos;ll tell you in the app before it takes effect.</p>
      </section>
      <section>
        <h2>Contact</h2>
        <p>
          Questions about these terms? Write to{" "}
          <a href="mailto:devin.hasler@bleat.ch" className="text-foreground underline decoration-foreground/25 underline-offset-4 hover:decoration-brand">
            devin.hasler@bleat.ch
          </a>
          .
        </p>
      </section>
    </LegalPage>
  );
}
