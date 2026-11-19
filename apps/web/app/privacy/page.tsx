import type { Metadata } from "next";
import { LegalPage } from "@/components/landing/legal";

export const metadata: Metadata = { title: "Privacy · Todalo" };

// Plain-language draft written from what the code does (docs/landing brief §2.6). Have it reviewed before launch.
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy." thin="Plainly put." updated="19 November 2026">
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
          <li>Google: sign-in and Google Calendar, only after you allow it on Google&apos;s own screen. See Google user data below.</li>
          <li>Todoist: only when you start an import. Todalo reads your projects and tasks once to copy them over.</li>
        </ul>
      </section>
      <section>
        <h2>Google user data</h2>
        <p>When you sign in with Google or connect Google Calendar, Todalo asks Google for this, and uses it only for what&apos;s listed:</p>
        <ul>
          <li>Your name, email address and profile picture, to create your account and sign you in.</li>
          <li>The list of your Google calendars, so you can choose in Settings › Calendars which ones Todalo shows.</li>
          <li>
            Events on your calendars. Todalo reads the events of the calendars you turn on to show them beside your tasks and plan around them. When you
            schedule a task, Todalo creates, updates or deletes that task&apos;s own event on your primary calendar. It doesn&apos;t touch your other events.
          </li>
          <li>
            When you ask the Coach to plan your week or a goal, the start and end times of your events go to the AI provider you chose for the Coach, so it
            doesn&apos;t plan over them. Event titles go along only if you turn on Settings › Coach › Share event titles with the AI.
          </li>
        </ul>
        <p>
          We keep the events of the calendars you turn on, and the access tokens Google gives us, in our database so the sync keeps running. No one at
          Todalo reads your Google data, unless you ask us to for support, it&apos;s needed for security, or the law requires it. We don&apos;t sell it,
          use it for ads, or use it to develop, improve or train generalised AI or machine learning models.
        </p>
        <p>
          Todalo&apos;s use and transfer to any other app of information received from Google APIs will adhere to the{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            className="text-foreground underline decoration-foreground/25 underline-offset-4 hover:decoration-brand"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>
        <p>
          To stop it, use Disconnect in Settings › Calendars: Todalo stops the sync, deletes the stored events and calendar settings, and removes the
          tokens. You can also remove Todalo&apos;s access at{" "}
          <a href="https://myaccount.google.com/permissions" className="text-foreground underline decoration-foreground/25 underline-offset-4 hover:decoration-brand">
            myaccount.google.com/permissions
          </a>
          .
        </p>
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
        <h2>Analytics and error reports</h2>
        <ul>
          <li>We count how the app is used (which screens and features, linked to your account id and email) with PostHog, hosted in the EU. There are no session recordings.</li>
          <li>When something breaks, the app sends an error report with your account id to Sentry, so we can fix it.</li>
          <li>Neither is used for advertising or shared with data brokers, and we don&apos;t track you across other apps or websites.</li>
        </ul>
      </section>
      <section>
        <h2>Where your data goes</h2>
        <p>
          Our database host and the services above (Google, ElevenLabs, Sentry and the AI provider you choose) process data outside Switzerland, mostly in the
          USA. Where a country doesn&apos;t offer protection the FADP recognises as adequate, we rely on the standard data processing terms these
          providers publish, which include the standard contractual clauses the FADP accepts.
        </p>
      </section>
      <section>
        <h2>How long we keep it</h2>
        <p>
          As long as your account exists. Delete it in Settings › Account › Delete account, or ask us to, and we delete your data with it, apart from what
          the law requires us to keep.
        </p>
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
          <a href="mailto:support@todalo.app" className="text-foreground underline decoration-foreground/25 underline-offset-4 hover:decoration-brand">
            support@todalo.app
          </a>
          .
        </p>
      </section>
    </LegalPage>
  );
}
