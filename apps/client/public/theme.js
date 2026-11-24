// Applies the saved mode, design, wallpaper and custom CSS before first paint (no flash). Same
// keys and values as src/theme.ts, src/personalization.ts and src/custom-css.ts, which own
// changes after load. An external file, so the Tauri CSP (script-src 'self') needs no 'unsafe-inline'.
try {
  var root = document.documentElement;
  var mode = localStorage.getItem("todalo-theme");
  root.classList.toggle("dark", mode === "dark" || (mode === "system" && matchMedia("(prefers-color-scheme: dark)").matches));
  // As designCss in personalization.ts: the design's variables in their own cascade layer.
  var design = JSON.parse(localStorage.getItem("todalo-design") || "{}"), rules = [];
  for (var prop in design) if (prop.indexOf("--") === 0) rules.push(prop + ":" + design[prop]);
  var style = document.createElement("style");
  style.id = "todalo-design";
  style.textContent = "@layer legacy, theme, design, base, components, utilities;@layer design{:root{" + rules.join(";") + "}}";
  document.head.appendChild(style);
  if (design["--design-sidebar"]) root.setAttribute("data-design", "");
  if (design["--design-glass"]) root.setAttribute("data-glass", "");
  if (design["--design-grain"]) root.setAttribute("data-grain", "");
  // As wallpaperCss in personalization.ts; the pattern keeps the URL inside url("…"). Only cached
  // while the image background is on (PersonalizationSync clears it for colours), and the cached
  // design leaves the colours out then, so one backdrop paints from the first frame.
  var wallpaper = localStorage.getItem("todalo-wallpaper");
  if (wallpaper && /^data:image\/(jpeg|webp|png);base64,[A-Za-z0-9+\/]+=*$/.test(wallpaper)) {
    style = document.createElement("style");
    style.id = "todalo-wallpaper";
    style.textContent = 'html::before{--design-wallpaper:url("' + wallpaper + '")}';
    document.head.appendChild(style);
    root.setAttribute("data-wallpaper", "");
  }
} catch (_) { /* light, plain theme */ }
try {
  // As applyCustomCss in custom-css.ts: stored already sanitized; ?safe skips it for this load.
  var custom = localStorage.getItem("todalo-custom-css");
  if (custom && !new URLSearchParams(location.search).has("safe")) {
    var sheet = document.createElement("style");
    sheet.id = "todalo-custom-css";
    sheet.textContent = custom;
    document.head.appendChild(sheet);
  }
} catch (_) { /* no custom CSS */ }
