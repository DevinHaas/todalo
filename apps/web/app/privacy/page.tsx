import type { Metadata } from "next";
import { LegalPage } from "@/components/landing/legal";

export const metadata: Metadata = { title: "Privacy · Todalo" };

// Plain-language draft written from what the code does (docs/landing brief §2.6). Have it reviewed before launch.
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy." thin="Plainly put." updated="10 November 2026">
      <p>Todalo is a planner. It keeps what you plan so you can come back to it, and nothing more is the goal. This page says what we store, who else sees it, and why.</p>
      <section>
        <h2>Who we are</h2>
        <p>Todalo is run by bleat, based in Switzerland. bleat is responsible for your personal data under the Swiss Federal Act on Data Protection (FADP).</p>
      </section>
      <section>
        <h2>What we store</h2>
        <ul>
          <li>Your account: name, email address and a hashed password, or the Google account you sign in with.</li>
          <li>What you plan: tasks, projects, labels, goals, seasons, reviews and ratings, and your Coach conversations.</li>
          <li>Your settings, including which calendar to sync and how the Coach should behave.</li>
        </ul>
      </section>
      <section>
        <h2>Services you connect</h2>
        <ul>
          <li>Google Calendar: only after you allow it. Todalo reads and writes events so your time blocks and your calendar stay in step.</li>
          <li>Todoist: only when you start an import. Todalo reads your projects and tasks once to copy them over.</li>
        </ul>
      </section>
      <section>
        <h2>AI</h2>
        <ul>
          <li>Ramble, our hosted voice capture, streams your audio to a speech-to-text provider (currently ElevenLabs) and sends the text to a language model to turn it into tasks.</li>
          <li>When you use the Coach with your own key, your request goes to the provider you picked: OpenAI, Anthropic, OpenRouter, or a local model through Ollama. Their own privacy terms apply there.</li>
          <li>API keys you add are encrypted at rest (AES-256-GCM) and only used for the requests you make.</li>
        </ul>
      </section>
      <section>
        <h2>Where your data goes</h2>
        <p>
          Our database host and the services above (Google, ElevenLabs and the AI provider you choose) process data outside Switzerland, mostly in the
          USA. Where a country doesn&apos;t offer protection the FADP recognises as adequate, we rely on the standard data processing terms these
          providers publish, which include the standard contractual clauses the FADP accepts.
        </p>
      </section>
      <section>
        <h2>How long we keep it</h2>
        <p>As long as your account exists. When you ask us to delete your account, we delete your data with it, apart from what the law requires us to keep.</p>
      </section>
      <section>
        <h2>Your rights</h2>
        <p>You can ask what we hold about you, have it corrected, get a copy, or have it deleted. Write to the address below and we&apos;ll answer within 30 days.</p>
      </section>
      <section>
        <h2>What we don&apos;t do</h2>
        <p>We don&apos;t sell your data, show ads, or use what you plan to train AI models.</p>
      </section>
      <section>
        <h2>Changes</h2>
        <p>If this page changes in a way that matters, we&apos;ll say so in the app before it takes effect.</p>
      </section>
      <section>
        <h2>Contact</h2>
        <p>
          Questions, or want your account and data deleted? Write to{" "}
          <a href="mailto:devin.hasler@bleat.ch" className="text-foreground underline decoration-foreground/25 underline-offset-4 hover:decoration-brand">
            devin.hasler@bleat.ch
          </a>
          .
        </p>
      </section>
    </LegalPage>
  );
}
