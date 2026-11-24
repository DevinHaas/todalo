// Personalization: the account's design (colours, grain, mode, accent, font, corners,
// borders, glass), wallpaper, custom CSS and sidebar layout, as one versioned document. Pure (zod only, client-safe). A design is plain
// JSON on purpose: it can later be shared, and installed from a design shop, as is.
import { z } from "zod";

export const designModes = ["system", "light", "dark"] as const;
export type DesignMode = (typeof designModes)[number];
/** The interface font: the OS font or one of a few self-hosted, open-licensed ones (the client maps ids to files). */
export const designFonts = ["system", "geist", "serif", "jetbrains-mono", "plex-mono"] as const;
export type DesignFont = (typeof designFonts)[number];
export const designCorners = ["sharp", "soft", "round"] as const;
export type DesignCorners = (typeof designCorners)[number];
export const designBorders = ["none", "subtle", "strong"] as const;
export type DesignBorders = (typeof designBorders)[number];
/** What fills the backdrop: the colours (a tint and wash) or the wallpaper, never both. */
export const designBackgrounds = ["color", "image"] as const;
export type DesignBackground = (typeof designBackgrounds)[number];

export interface DesignDto {
  /** System follows the OS; light and dark force one. */
  mode: DesignMode;
  /** 1-3 colours (#rrggbb) for the backdrop, a gradient from the first to the last. */
  colors: string[];
  /** 0-100: how much of the backdrop shows through the sidebar and page; 0 is the plain theme. */
  intensity: number;
  /** 0-100: film grain over the tinted surfaces. */
  grain: number;
  /** #rrggbb for buttons, links and the selected item; null is Todalo red. */
  accent: string | null;
  /** System is today's OS font; only the chosen font's files load. */
  font: DesignFont;
  /** The radius scale; soft is today's. */
  corners: DesignCorners;
  /** Lines between and around panels; subtle is today's. */
  borders: DesignBorders;
  /** #rrggbb for those lines; null is the theme's grey. */
  borderColor: string | null;
  /** 0-100: how see-through the sidebar, page and dialogs are over the wallpaper or colour wash; 0 is opaque (today). */
  glass: number;
  /**
   * Which backdrop shows: the colours above, or the document's wallpaper. Both stay stored, so
   * switching back restores the other. Documents from before default to image when they have a
   * wallpaper; design codes (which never carry the picture) to colour.
   */
  background: DesignBackground;
}

/** Every sidebar entry. Views (search…more) that sit next to each other render as one list. */
export const sidebarEntries = ["rituals", "season", "goals", "search", "inbox", "today", "upcoming", "filters", "reporting", "more", "favorites", "projects"] as const;
export type SidebarEntry = (typeof sidebarEntries)[number];
export const sidebarViews: readonly SidebarEntry[] = ["search", "inbox", "today", "upcoming", "filters", "reporting", "more"];

export interface SidebarDto {
  /** Top to bottom; entries missing here (added in a later version) keep their default place. */
  order: SidebarEntry[];
  hidden: SidebarEntry[];
}

export interface PersonalizationDto {
  version: 1;
  design: DesignDto;
  sidebar: SidebarDto;
  /**
   * A picture behind the whole app (seen through glass), as a JPEG/WebP/PNG data URL the
   * client downsized. Kept out of DesignDto so design codes stay short.
   * ponytail: inline in the jsonb document; move to object storage if documents grow.
   */
  wallpaper: string | null;
  /**
   * Advanced: the account's own stylesheet, applied after the app's CSS (client
   * custom-css.ts sanitizes it before use: no network loads). Also outside DesignDto.
   */
  customCss: CustomCssDto | null;
}

export interface CustomCssDto {
  css: string;
  /** Off keeps the CSS but doesn't apply it (Settings, the keyboard toggle). */
  enabled: boolean;
}

export const defaultDesign: DesignDto = { mode: "light", colors: ["#c9b8a6"], intensity: 0, grain: 0, accent: null, font: "system", corners: "soft", borders: "subtle", borderColor: null, glass: 0, background: "color" };
export const defaultSidebar: SidebarDto = { order: [...sidebarEntries], hidden: [] };
export const defaultPersonalization: PersonalizationDto = { version: 1, design: defaultDesign, sidebar: defaultSidebar, wallpaper: null, customCss: null };

/** The longest wallpaper data URL accepted (~1 MB); the client downsizes until it fits. */
export const WALLPAPER_MAX_LENGTH = 1_000_000;
/** The longest custom CSS accepted: 64 K characters. */
export const CUSTOM_CSS_MAX_LENGTH = 65_536;

const hex = z.string().regex(/^#[0-9a-f]{6}$/i).transform(value => value.toLowerCase());
const percent = z.number().int().min(0).max(100);
const entry = z.enum(sidebarEntries);
// Only base64 after a fixed image prefix, so the URL can never break out of CSS url("…").
const wallpaper = z.string().max(WALLPAPER_MAX_LENGTH).regex(/^data:image\/(?:jpeg|webp|png);base64,[A-Za-z0-9+/]+={0,2}$/);

// Fields added after the first release default, so older documents and design codes still load.
export const designInput = z.object({
  mode: z.enum(designModes),
  colors: z.array(hex).min(1).max(3),
  intensity: percent,
  grain: percent,
  accent: hex.nullable(),
  font: z.enum(designFonts).default("system"),
  corners: z.enum(designCorners).default("soft"),
  borders: z.enum(designBorders).default("subtle"),
  borderColor: hex.nullable().default(null),
  glass: percent.default(0),
  // Optional here: personalizationInput fills it from the document's wallpaper.
  background: z.enum(designBackgrounds).optional(),
}).strict();

/** PUT /api/v1/settings/personalization: the whole document is replaced; the trust boundary for both apps. */
export const personalizationInput = z.object({
  version: z.literal(1),
  design: designInput,
  sidebar: z.object({
    order: z.array(entry).max(sidebarEntries.length).refine(list => new Set(list).size === list.length, "Each sidebar entry once."),
    hidden: z.array(entry).max(sidebarEntries.length),
  }).strict(),
  wallpaper: wallpaper.nullable().default(null),
  customCss: z.object({ css: z.string().max(CUSTOM_CSS_MAX_LENGTH), enabled: z.boolean() }).strict().nullable().default(null),
}).strict().transform(document => ({
  ...document,
  design: { ...document.design, background: document.design.background ?? (document.wallpaper ? "image" as const : "color" as const) },
}));

/**
 * The sidebar to render: the saved order, with any entry it lacks put back where the
 * default order has it (after its default predecessor), so new entries appear on update.
 * Search is left out: it is pinned directly under Add task, so it can't be moved or hidden.
 * It stays in sidebarEntries so documents saved with it still parse.
 */
export function sidebarOrder(sidebar: SidebarDto): SidebarEntry[] {
  const movable: SidebarEntry[] = sidebarEntries.filter(item => item !== "search");
  const order = sidebar.order.filter(item => movable.includes(item));
  for (const [index, item] of movable.entries()) {
    if (order.includes(item)) continue;
    const before = movable.slice(0, index).reverse().find(previous => order.includes(previous));
    order.splice(before ? order.indexOf(before) + 1 : 0, 0, item);
  }
  return order;
}

/** A stored or shared document, or the defaults when it is missing or no longer valid. */
export function readPersonalization(value: unknown): PersonalizationDto {
  const parsed = personalizationInput.safeParse(value);
  return parsed.success ? parsed.data : defaultPersonalization;
}
