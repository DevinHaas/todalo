// Applies the saved mode and design before first paint (no flash). Same keys and
// values as src/theme.ts and src/personalization.ts, which own changes after load.
// An external file, so the Tauri CSP (script-src 'self') needs no 'unsafe-inline'.
try {
  var root = document.documentElement;
  var mode = localStorage.getItem("todalo-theme");
  root.classList.toggle("dark", mode === "dark" || (mode === "system" && matchMedia("(prefers-color-scheme: dark)").matches));
  var design = JSON.parse(localStorage.getItem("todalo-design") || "{}");
  for (var prop in design) if (prop.indexOf("--") === 0) root.style.setProperty(prop, design[prop]);
  if (design["--design-sidebar"]) root.setAttribute("data-design", "");
} catch (_) { /* light, plain theme */ }
