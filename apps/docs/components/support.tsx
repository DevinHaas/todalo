import { FeedbackButton } from "./feedback-button";

export function Support({ title = "Get in touch" }: { title?: string }) {
  return (
    <section className="support-section" aria-label={title}>
      <div>
        <h2>{title}</h2>
        <p>We’re here to help. Write to <a className="text-link" href="mailto:support@todalo.app">support@todalo.app</a>.</p>
      </div>
      <FeedbackButton />
    </section>
  );
}
