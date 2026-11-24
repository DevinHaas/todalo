// Settings › Appearance and Sidebar: the account's design and sidebar layout (one
// synced document), how a design becomes CSS, and the local copy that paints it
// before the first frame (public/theme.js).
import { invoke, isTauri } from "@tauri-apps/api/core";
import { queryOptions } from "@tanstack/react-query";
import { AccountTransportError, nativeAccountError } from "./errors";
import { WALLPAPER_MAX_LENGTH, defaultPersonalization, readPersonalization, type DesignDto, type DesignFont, type PersonalizationDto } from "../../../packages/server/src/personalization-dto";

export { CUSTOM_CSS_MAX_LENGTH, WALLPAPER_MAX_LENGTH, defaultDesign, defaultPersonalization, designBackgrounds, designBorders, designCorners, designFonts, sidebarEntries, sidebarOrder, sidebarViews } from "../../../packages/server/src/personalization-dto";
export type { CustomCssDto, DesignBackground, DesignBorders, DesignCorners, DesignDto, DesignFont, DesignMode, PersonalizationDto, SidebarDto, SidebarEntry } from "../../../packages/server/src/personalization-dto";

export interface PersonalizationTransport {
  /** Null while the account never saved one. */
  get(): Promise<PersonalizationDto | null>;
  save(document: PersonalizationDto): Promise<PersonalizationDto>;
}

const parse = (body: unknown) => {
  const value = (body as { personalization?: unknown } | null)?.personalization;
  return value === null ? null : readPersonalization(value);
};

export function browserPersonalizationTransport(fetcher: typeof fetch = fetch): PersonalizationTransport {
  async function request(method: "GET" | "PUT", document?: PersonalizationDto) {
    let response: Response;
    try {
      response = await fetcher("/api/v1/settings/personalization", {
        method, credentials: "same-origin", cache: "no-store",
        ...(document && { headers: { "content-type": "application/json" }, body: JSON.stringify({ personalization: document }) }),
      });
    } catch { throw new AccountTransportError("CONNECTION_FAILED"); }
    if (response.status === 401) throw new AccountTransportError("UNAUTHENTICATED");
    if (response.status === 400) throw new AccountTransportError("INVALID_INPUT");
    if (!response.ok) throw new AccountTransportError(method === "GET" ? "SETTINGS_UNAVAILABLE" : "SAVE_FAILED");
    return parse(await response.json().catch(() => null));
  }
  return { get: () => request("GET"), save: async (document) => (await request("PUT", document)) ?? document };
}

export function personalizationTransport(): PersonalizationTransport {
  if (!isTauri()) return browserPersonalizationTransport();
  const command = async (name: string, args?: Record<string, unknown>) => {
    try { return parse(await invoke(name, args)); }
    catch (error) { throw error instanceof AccountTransportError ? error : nativeAccountError(error); }
  };
  // Fixed native commands; Rust attaches the Keychain bearer token.
  return { get: () => command("personalization"), save: async (personalization) => (await command("update_personalization", { personalization })) ?? personalization };
}

export const personalizationKeys = { document: (userId: string) => ["user", userId, "personalization"] as const };
export const personalizationQueries = (transport: PersonalizationTransport) => ({
  document: (userId: string) => queryOptions({ queryKey: personalizationKeys.document(userId), queryFn: () => transport.get(), staleTime: 60_000 }),
});

// ---- Design → CSS -------------------------------------------------------------

const DESIGN_KEY = "todalo-design";
const WALLPAPER_KEY = "todalo-wallpaper";
/** Every design prop; an older theme.js set them inline on <html>, so they are cleared there. */
const props = [
  "--color-background", "--color-sidebar", "--color-sidebar-accent", "--design-sidebar", "--color-brand", "--color-brand-hover", "--color-brand-tint", "--color-brand-tint-foreground", "--color-primary",
  "--font-sans", "--design-corners", "--color-border", "--color-border-subtle", "--color-border-hover", "--color-input", "--color-sidebar-border", "--design-panel-border",
  "--design-glass", "--design-blur", "--design-backdrop", "--design-grain",
] as const;

/**
 * Each font's stack. Every family is declared up front (main.tsx imports the @fontsource
 * CSS), but a browser only downloads a face's files once text uses it, so only the
 * chosen font loads. System keeps theme.css's own stack.
 */
export const fontStacks: Record<DesignFont, string | null> = {
  system: null,
  geist: `"Geist Variable", system-ui, sans-serif`,
  serif: `"Source Serif 4 Variable", ui-serif, Georgia, serif`,
  "jetbrains-mono": `"JetBrains Mono Variable", ui-monospace, Menlo, monospace`,
  "plex-mono": `"IBM Plex Mono", ui-monospace, Menlo, monospace`,
};

/** Multiplies every radius (theme.css tokens and the legacy screens); soft (1) is today's. */
const cornerScale = { sharp: "0", soft: null, round: "1.6" } as const;

const see = (color: string, percent: number) => percent >= 100 ? color : `color-mix(in oklch, ${color} ${percent}%, transparent)`;

/** Grain's strength for an amount 0-100: a gentle curve (low amounts still show) up to 15% opacity. */
export const grainStrength = (amount: number) => (Math.max(0, Math.min(100, amount)) / 100) ** 0.75;

/**
 * Film grain as one tiling SVG: fine noise (about a device pixel per speck) split into light
 * specks where it runs high and dark specks where it runs low, so it reads on light and dark
 * designs alike. Tuned against a reference at 2x: 100 is a dense, clearly visible speckle
 * (luminance sd ≈ 8 on a dark purple), 50 a calmer one (≈ 4.5); 0 draws nothing.
 */
export const grainImage = (amount: number) => `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256'><filter id='g' x='0' y='0' width='100%' height='100%' color-interpolation-filters='sRGB'>`
  + `<feTurbulence type='fractalNoise' baseFrequency='1.2' numOctaves='2' seed='3' stitchTiles='stitch' result='n'/>`
  + `<feColorMatrix in='n' result='light' values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  5 0 0 0 -2.8'/>`
  + `<feColorMatrix in='n' result='dark' values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -5 0 0 0 2.2'/>`
  + `<feMerge><feMergeNode in='light'/><feMergeNode in='dark'/></feMerge></filter>`
  + `<rect width='100%' height='100%' filter='url(#g)' opacity='${(grainStrength(amount) * 0.15).toFixed(3)}'/></svg>`)}")`;

/**
 * The CSS custom properties for a design, given the plain theme's own page and
 * sidebar colours (`base`, read before any override) and whether the mode is dark. The sidebar takes the colours
 * as a gradient (up to 60 % colour) with the grain; the page takes a faint tint of
 * the first colour (up to 12 %) so text stays easy to read. The accent recolours brand red.
 *
 * Font, corners and borders swap theme tokens. Glass makes the sidebar, page and dialogs
 * translucent (--design-glass is their opacity, theme.css draws them) over the colours as a
 * wash (--design-backdrop, blurred less as glass rises) or the wallpaper. With the image
 * background the colours are left out entirely (no tint, no wash): one backdrop at a time.
 */
export function designProperties(design: DesignDto, base: { background: string; sidebar: string }, dark = false): Record<string, string> {
  const out: Record<string, string> = {};
  const colors = design.background !== "image";
  const amount = colors ? design.intensity : 0;
  const glass = design.glass > 0;
  // Dark mode deepens each colour first, so the sidebar stays dark and its text stays readable.
  const tone = (color: string) => dark ? `color-mix(in oklch, ${color}, black 55%)` : color;
  const pane = (color: string) => glass ? `color-mix(in oklch, ${color} var(--design-glass), transparent)` : color;
  const gradient = (stops: string[]) => stops.length === 1 ? `${stops[0]}, ${stops[0]}` : stops.join(", ");
  // One tile for every background surface: the sidebar here, the page in theme.css (data-grain).
  if (design.grain > 0) out["--design-grain"] = grainImage(design.grain);
  const grain = design.grain > 0 ? "var(--design-grain), " : "";
  if (amount > 0) {
    const stops = design.colors.map(color => `color-mix(in oklch, ${base.sidebar} ${100 - Math.round(amount * 0.6)}%, ${tone(color)})`);
    out["--color-sidebar"] = stops[0]!;
    out["--color-background"] = `color-mix(in oklch, ${base.background} ${100 - Math.round(amount * 0.12)}%, ${tone(design.colors[0]!)})`;
    out["--design-sidebar"] = `${grain}linear-gradient(170deg, ${gradient(stops.map(pane))})`;
  } else if (design.grain > 0 || glass) {
    out["--design-sidebar"] = `${grain}linear-gradient(${pane(base.sidebar)}, ${pane(base.sidebar)})`;
  }
  if (amount > 0 || glass) out["--color-sidebar-accent"] = "color-mix(in oklch, var(--color-foreground) 8%, transparent)";
  if (glass) {
    out["--design-glass"] = `${100 - Math.round(design.glass * 0.8)}%`;
    out["--design-blur"] = `${Math.round((100 - design.glass) * 0.16)}px`;
    if (colors) out["--design-backdrop"] = `linear-gradient(160deg, ${gradient(design.colors.map(tone))})`;
  }
  const font = fontStacks[design.font];
  if (font) out["--font-sans"] = font;
  const corners = cornerScale[design.corners];
  if (corners) out["--design-corners"] = corners;
  if (design.borders === "none") {
    for (const prop of ["--color-border-subtle", "--color-sidebar-border", "--design-panel-border"]) out[prop] = "transparent";
  } else if (design.borders === "strong" || design.borderColor) {
    // Strong draws the panel edges (sidebar, settings) in full and the lines inside them a step quieter.
    const ink = design.borderColor ?? "var(--color-foreground)";
    const [panel, line, subtle, hover] = design.borders === "subtle" ? [null, 40, 22, 60] : design.borderColor ? [100, 55, 32, 80] : [45, 26, 14, 40];
    for (const prop of ["--color-border", "--color-input", "--color-sidebar-border"]) out[prop] = see(ink, line);
    out["--color-border-subtle"] = see(ink, subtle);
    out["--color-border-hover"] = see(ink, hover);
    if (panel) out["--design-panel-border"] = see(ink, panel);
  }
  if (design.accent) {
    // Dark mode lifts the accent a little, as Todalo's own red is lighter there, so text in it stays readable.
    const accent = dark ? `color-mix(in oklch, ${design.accent}, white 22%)` : design.accent;
    out["--color-brand"] = accent;
    out["--color-primary"] = accent;
    out["--color-brand-hover"] = `color-mix(in oklch, ${accent}, ${dark ? "white" : "black"} 14%)`;
    out["--color-brand-tint"] = `color-mix(in oklch, ${accent} 16%, var(--color-background))`;
    out["--color-brand-tint-foreground"] = `color-mix(in oklch, ${accent}, var(--color-foreground) 28%)`;
  }
  return out;
}

/**
 * The design as a stylesheet: its own cascade layer, over theme.css's tokens (light and dark)
 * and under the components, so the unlayered custom CSS (custom-css.ts) beats it. The order
 * repeats ui/styles.css's, in case this style is parsed first. public/theme.js builds the same.
 */
export const designCss = (properties: Record<string, string>) =>
  `@layer legacy, theme, design, base, components, utilities;@layer design{:root{${Object.entries(properties).map(([prop, value]) => `${prop}:${value}`).join(";")}}}`;

const DESIGN_STYLE_ID = "todalo-design";
function paint(root: HTMLElement, properties: Record<string, string>) {
  const page = root.ownerDocument;
  let style = page.getElementById(DESIGN_STYLE_ID);
  if (!style) { style = page.createElement("style"); style.id = DESIGN_STYLE_ID; page.head.append(style); }
  style.textContent = designCss(properties);
  for (const prop of props) root.style.removeProperty(prop);
  root.toggleAttribute("data-design", "--design-sidebar" in properties);
  root.toggleAttribute("data-glass", "--design-glass" in properties);
  root.toggleAttribute("data-grain", "--design-grain" in properties);
}

/** Applies a design now and remembers it for the next launch's first frame. */
export function applyDesign(design: DesignDto, root: HTMLElement = document.documentElement) {
  // The plain theme's colours (custom CSS included) first, without the last design.
  paint(root, {});
  const style = getComputedStyle(root);
  const base = { background: style.getPropertyValue("--color-background").trim() || "#ffffff", sidebar: style.getPropertyValue("--color-sidebar").trim() || "#fcfaf8" };
  const next = designProperties(design, base, root.classList.contains("dark"));
  paint(root, next);
  try { localStorage.setItem(DESIGN_KEY, JSON.stringify(next)); } catch { /* not remembered */ }
}

/** Before first render: the last design's properties (theme.js repeats this before paint). */
export function applySavedDesign(root: HTMLElement = document.documentElement) {
  try {
    const saved = JSON.parse(localStorage.getItem(DESIGN_KEY) ?? "{}") as Record<string, string>;
    paint(root, Object.fromEntries(Object.entries(saved).filter(([prop]) => prop.startsWith("--"))));
  } catch { /* plain theme */ }
}

/**
 * The wallpaper's one rule: a variable on the backdrop layer only (theme.css paints it), so a
 * ~1 MB string is neither inherited by every element nor rewritten with <html>'s style.
 * Safe in url("…"): the DTO only accepts base64 after an image prefix. theme.js repeats it.
 */
export const wallpaperCss = (wallpaper: string) => `html::before{--design-wallpaper:url("${wallpaper}")}`;

/** Shows (or clears) the wallpaper behind glass now, and remembers it for the next launch's first frame. */
export function applyWallpaper(wallpaper: string | null, root: HTMLElement = document.documentElement) {
  const page = root.ownerDocument;
  let style = page.getElementById("todalo-wallpaper");
  root.toggleAttribute("data-wallpaper", wallpaper !== null);
  try {
    if (localStorage.getItem(WALLPAPER_KEY) !== wallpaper) {
      if (wallpaper) localStorage.setItem(WALLPAPER_KEY, wallpaper); else localStorage.removeItem(WALLPAPER_KEY);
    }
  } catch { /* not remembered: too big for this device's storage */ }
  if (!wallpaper) { style?.remove(); return; }
  if (!style) { style = page.createElement("style"); style.id = "todalo-wallpaper"; page.head.append(style); }
  const css = wallpaperCss(wallpaper);
  if (style.textContent !== css) style.textContent = css;
}

/**
 * An image file as a wallpaper data URL: at most 2560px on its long side, WebP (JPEG where
 * the browser can't encode WebP), stepping quality and then size down until it fits the DTO's cap.
 */
export async function wallpaperFromFile(file: Blob, maxLength = WALLPAPER_MAX_LENGTH): Promise<string> {
  const image = await createImageBitmap(file);
  try {
    const long = Math.max(image.width, image.height);
    let side = Math.min(2560, long);
    for (let attempt = 0; attempt < 12; attempt++) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * side / long));
      canvas.height = Math.max(1, Math.round(image.height * side / long));
      canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
      const quality = [0.82, 0.7, 0.58][attempt % 3];
      let url = canvas.toDataURL("image/webp", quality);
      if (!url.startsWith("data:image/webp")) url = canvas.toDataURL("image/jpeg", quality);
      if (url.length <= maxLength) return url;
      if (attempt % 3 === 2) side = Math.round(side * 0.75);
    }
  } finally { image.close(); }
  throw new Error("The image is too large to use as a wallpaper.");
}

/** A design as a short code to copy and paste (the future design shop installs the same JSON). */
export const designCode = (design: DesignDto) => `todalo-design:${btoa(JSON.stringify(design))}`;
export function readDesignCode(code: string): DesignDto | null {
  const match = /^todalo-design:([A-Za-z0-9+/=]+)$/.exec(code.trim());
  if (!match) return null;
  try {
    const parsed = readPersonalization({ ...defaultPersonalization, design: JSON.parse(atob(match[1]!)) });
    return parsed === defaultPersonalization ? null : parsed.design;
  } catch { return null; }
}

// ---- The colour field: x is hue, y runs from pale (top) to deep (bottom) ------------

const clamp = (value: number, low = 0, high = 1) => Math.min(high, Math.max(low, value));
const toLinear = (c: number) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const toGamma = (c: number) => c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;

/** OKLCH (l 0-1, c, h degrees) to #rrggbb, clipped into sRGB. */
export function oklchToHex(l: number, c: number, h: number) {
  const a = c * Math.cos(h * Math.PI / 180), b = c * Math.sin(h * Math.PI / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3, m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3, s_ = (l - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  const rgb = [4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_, -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_, -0.0041960863 * l_ - 0.7034186147 * m_ + 1.7076147010 * s_];
  return `#${rgb.map(v => Math.round(clamp(toGamma(clamp(v))) * 255).toString(16).padStart(2, "0")).join("")}`;
}

/** #rrggbb to OKLCH. */
export function hexToOklch(hex: string) {
  const [r, g, b] = [1, 3, 5].map(i => toLinear(parseInt(hex.slice(i, i + 2), 16) / 255)) as [number, number, number];
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363371447 * g + 0.0514406377 * b), m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const l = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_, a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_, bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;
  return { l, c: Math.hypot(a, bb), h: (Math.atan2(bb, a) * 180 / Math.PI + 360) % 360 };
}

// Top of the field: pale and soft; bottom: deeper and more saturated.
const fieldL = (y: number) => 0.92 - y * 0.4;
const fieldC = (y: number) => 0.03 + y * 0.13;

/** The colour at a point of the field (x, y in 0-1). */
export const fieldColor = (x: number, y: number) => oklchToHex(fieldL(clamp(y)), fieldC(clamp(y)), clamp(x) * 360);
/** Where a colour sits on the field (its nearest point), for the handles. */
export function fieldPoint(hex: string) {
  const { l, h } = hexToOklch(hex);
  return { x: h / 360, y: clamp((0.92 - l) / 0.4) };
}
