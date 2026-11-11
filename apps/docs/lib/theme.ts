// Light and dark: follow the system until the visitor picks one, then remember
// the pick. The `dark` class on <html> is the switch (see app/globals.css).
export const THEME_KEY = "todalo-help-theme";

// Runs in <head> before first paint so the page never flashes the wrong theme.
// Kept as a plain string: it is inlined into the HTML, not bundled.
export const themeScript = `(function () {
  var stored = null;
  try { stored = localStorage.getItem("${THEME_KEY}"); } catch (e) {}
  var dark = stored ? stored === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.classList.toggle("dark", dark);
})();`;
