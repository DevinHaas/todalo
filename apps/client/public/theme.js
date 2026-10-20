// Applies the saved theme before first paint (no light flash). Same key and
// values as src/theme.ts, which owns changes after load. An external file, so
// the Tauri CSP (script-src 'self') needs no 'unsafe-inline'.
try { document.documentElement.classList.toggle("dark", localStorage.getItem("todalo-theme") === "dark"); } catch (_) { /* light */ }
