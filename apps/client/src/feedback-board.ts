// The FeatureSpace feedback widget: a bug, idea or feature request, a message, an optional screenshot, notes on the page and
// recent errors (only if the user agrees) land as a request on the todalo board, tagged with
// who sent it and which build. Opened from the account menu, so no floating button competes
// with the Coach bar. It styles itself with inline <style> in a shadow root, which the Tauri
// CSP allows only because tauri.conf.json keeps Tauri from adding nonces to style-src.
import { useEffect } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { destroy, init, open, type FeatureSpaceOptions } from "featurespace";
import { cssHex } from "./liquid";
import { appVersion } from "./releases";
import type { Account } from "./session";

// The widget takes the accent as a hex value: the SDK appends alpha to it for tints (a CSS variable would break those).
const accent = () => cssHex(getComputedStyle(document.documentElement).getPropertyValue("--color-brand"));
let options: FeatureSpaceOptions | null = null, painted = "";
const start = () => { if (options) init({ ...options, color: painted = accent() }); };

/** Opens the form, first restarting the widget if the accent changed since it started. */
export function openFeedback() {
  if (options && accent() !== painted) { destroy(); start(); }
  open();
}

export function useFeedbackBoard({ user }: Account) {
  const { id, email, name } = user;
  useEffect(() => {
    options = {
      board: "todalo",
      // unset: https://featurespace.dev; a local FeatureSpace in development
      host: import.meta.env.VITE_FEATURESPACE_HOST || undefined,
      user: { id, email, name },
      metadata: { appVersion, app: isTauri() ? "native" : "web" },
      button: false,
      // One form, a switch for the kind: each lands in the board category of that name.
      types: [
        { label: "Bug", placeholder: "What went wrong?", details: "What did you do, and what did you expect to happen?" },
        { label: "Idea", placeholder: "What would make Todalo better?", details: "How would it help you?" },
        { label: "Feature request", category: "Feature", placeholder: "What should Todalo do?", details: "What would you use it for?" },
      ],
    };
    start();
    return () => { options = null; destroy(); };
  }, [id, email, name]);
}
