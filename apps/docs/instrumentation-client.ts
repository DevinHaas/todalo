import posthog from "posthog-js";

const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
if (key) {
  posthog.init(key, {
    api_host: "/ingest",
    ui_host: "https://eu.posthog.com",
    defaults: "2026-08-30",
    cookieless_mode: "always",
    autocapture: false,
    before_send: (event) => {
      if (event) event.properties = { ...event.properties, site: "help", app: "help" };
      return event;
    },
  });
}
