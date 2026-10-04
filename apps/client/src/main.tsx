import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { queries } from "./runtime";
import "@fontsource-variable/geist";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);
root.render(<QueryClientProvider client={queries}><App /></QueryClientProvider>);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
