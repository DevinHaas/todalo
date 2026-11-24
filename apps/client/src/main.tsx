import { identify } from "./monitoring"; // first: catches errors from everything below
import { theme } from "./theme";
import { applySavedDesign } from "./personalization";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { queries, session } from "./runtime";
// Appearance › Font (personalization.ts fontStacks): @font-face rules only; a face's files
// download once text uses it, so only the chosen font loads.
import "@fontsource-variable/geist";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource-variable/source-serif-4";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "@fontsource/ibm-plex-mono/700.css";
import "./ui/styles.css"; // includes ./styles.css (legacy layer)
import { trackSoftwareKeyboard } from "./software-keyboard";
import { isTauri } from "@tauri-apps/api/core";
import { followNativeLinks } from "./links";
import { toasts } from "./toasts";
import { Toaster } from "./ui";

// ponytail: before render, not pre-paint; the Tauri CSP forbids an inline <head> script.
theme.apply();
applySavedDesign();
trackSoftwareKeyboard();
// Task deep links Rust accepted (cold or warm launch); before render so none waits.
if (isTauri()) void followNativeLinks();
// Mac: the window has an overlay title bar (tauri.conf.json); the sidebar and toolbar make room for the traffic lights.
if (isTauri() && /Mac/.test(navigator.platform) && navigator.maxTouchPoints === 0) document.documentElement.dataset.titlebar = "overlay";
// Analytics and errors follow the signed-in account; signing out forgets it.
session.subscribe(() => {
  const { status, account } = session.getSnapshot();
  if (status === "signed-in" && account) identify(account.user);
  else if (status === "signed-out") identify(null);
});
const root = createRoot(document.getElementById("root")!);
root.render(<QueryClientProvider client={queries}><App /><Toaster manager={toasts} /></QueryClientProvider>);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
