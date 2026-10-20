import { theme } from "./theme";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { queries } from "./runtime";
import "@fontsource-variable/geist";
import "./styles.css";
import { trackSoftwareKeyboard } from "./software-keyboard";
import { isTauri } from "@tauri-apps/api/core";
import { followNativeLinks } from "./links";

// ponytail: before render, not pre-paint; the Tauri CSP forbids an inline <head> script.
theme.apply();
trackSoftwareKeyboard();
// Task deep links Rust accepted (cold or warm launch); before render so none waits.
if (isTauri()) void followNativeLinks();
const root = createRoot(document.getElementById("root")!);
root.render(<QueryClientProvider client={queries}><App /></QueryClientProvider>);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
