// The FeatureSpace feedback widget: a message, an optional screenshot, notes on the page and
// recent errors (only if the user agrees) land as a request on the todalo board, tagged with
// who sent it and which build. Opened from the account menu, so no floating button competes
// with the Coach bar.
import { useEffect } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { destroy, init } from "featurespace";
import { appVersion } from "./releases";
import type { Account } from "./session";

export { open as openFeedback } from "featurespace";

export function useFeedbackBoard({ user }: Account) {
  const { id, email, name } = user;
  useEffect(() => {
    init({
      board: "todalo",
      // unset: https://featurespace.dev; a local FeatureSpace in development
      host: import.meta.env.VITE_FEATURESPACE_HOST || undefined,
      user: { id, email, name },
      metadata: { appVersion, app: isTauri() ? "native" : "web" },
      button: false,
      color: "var(--brand)",
    });
    return destroy;
  }, [id, email, name]);
}
