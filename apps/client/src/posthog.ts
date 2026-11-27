// PostHog with every extension bundled: the Tauri CSP allows no remote scripts, so the
// no-external build can't fetch the recorder, dead-click or exception code at runtime.
import posthog from "posthog-js/dist/module.no-external";
import "posthog-js/dist/posthog-recorder";
import "posthog-js/dist/dead-clicks-autocapture";
import "posthog-js/dist/exception-autocapture";

export default posthog;
