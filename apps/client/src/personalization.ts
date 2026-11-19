// Settings › Appearance and Sidebar: the account's design and sidebar layout (one
// synced document), how a design becomes CSS, and the local copy that paints it
// before the first frame (public/theme.js).
import { invoke, isTauri } from "@tauri-apps/api/core";
import { queryOptions } from "@tanstack/react-query";
import { AccountTransportError, nativeAccountError } from "./errors";
import { defaultPersonalization, readPersonalization, type DesignDto, type PersonalizationDto } from "../../../packages/server/src/personalization-dto";

export { defaultDesign, defaultPersonalization, sidebarEntries, sidebarOrder, sidebarViews } from "../../../packages/server/src/personalization-dto";
export type { DesignDto, DesignMode, PersonalizationDto, SidebarDto, SidebarEntry } from "../../../packages/server/src/personalization-dto";

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
/** The design props this sets on <html>; cleared again for the plain theme. */
const props = ["--color-background", "--color-sidebar", "--color-sidebar-accent", "--design-sidebar", "--color-brand", "--color-brand-hover", "--color-brand-tint", "--color-brand-tint-foreground", "--color-primary"] as const;

/** Film grain as a tiling SVG; `amount` 0-100 sets its strength. */
export const grainImage = (amount: number) => `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='g'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .5  0 0 0 0 .5  0 0 0 0 .5  0 0 0 ${(amount / 100 * 0.42).toFixed(3)} 0'/></filter><rect width='100%' height='100%' filter='url(#g)'/></svg>`)}")`;

/**
 * The CSS custom properties for a design, given the plain theme's own page and
 * sidebar colours (`base`, read before any override) and whether the mode is dark. The sidebar takes the colours
 * as a gradient (up to 60 % colour) with the grain; the page takes a faint tint of
 * the first colour (up to 12 %) so text stays easy to read. The accent recolours brand red.
 */
export function designProperties(design: DesignDto, base: { background: string; sidebar: string }, dark = false): Record<string, string> {
  const out: Record<string, string> = {};
  const amount = design.intensity;
  if (amount > 0) {
    // Dark mode deepens each colour first, so the sidebar stays dark and its text stays readable.
    const tone = (color: string) => dark ? `color-mix(in oklch, ${color}, black 55%)` : color;
    const stops = design.colors.map(color => `color-mix(in oklch, ${base.sidebar} ${100 - Math.round(amount * 0.6)}%, ${tone(color)})`);
    out["--color-sidebar"] = stops[0]!;
    out["--color-background"] = `color-mix(in oklch, ${base.background} ${100 - Math.round(amount * 0.12)}%, ${tone(design.colors[0]!)})`;
    out["--color-sidebar-accent"] = "color-mix(in oklch, var(--color-foreground) 8%, transparent)";
    out["--design-sidebar"] = `${design.grain > 0 ? `${grainImage(design.grain)}, ` : ""}linear-gradient(170deg, ${stops.length === 1 ? `${stops[0]}, ${stops[0]}` : stops.join(", ")})`;
  } else if (design.grain > 0) {
    out["--design-sidebar"] = `${grainImage(design.grain)}, linear-gradient(${base.sidebar}, ${base.sidebar})`;
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

/** Applies a design to <html> now and remembers it for the next launch's first frame. */
export function applyDesign(design: DesignDto, root: HTMLElement = document.documentElement) {
  for (const prop of props) root.style.removeProperty(prop);
  const style = getComputedStyle(root);
  const base = { background: style.getPropertyValue("--color-background").trim() || "#ffffff", sidebar: style.getPropertyValue("--color-sidebar").trim() || "#fcfaf8" };
  const next = designProperties(design, base, root.classList.contains("dark"));
  for (const [prop, value] of Object.entries(next)) root.style.setProperty(prop, value);
  root.toggleAttribute("data-design", "--design-sidebar" in next);
  try { localStorage.setItem(DESIGN_KEY, JSON.stringify(next)); } catch { /* not remembered */ }
}

/** Before first render: the last design's properties (theme.js repeats this before paint). */
export function applySavedDesign(root: HTMLElement = document.documentElement) {
  try {
    const saved = JSON.parse(localStorage.getItem(DESIGN_KEY) ?? "{}") as Record<string, string>;
    for (const [prop, value] of Object.entries(saved)) if (prop.startsWith("--")) root.style.setProperty(prop, value);
    root.toggleAttribute("data-design", "--design-sidebar" in saved);
  } catch { /* plain theme */ }
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
