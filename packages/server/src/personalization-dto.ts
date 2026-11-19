// Personalization: the account's design (colours, grain, mode, accent) and its sidebar
// layout, as one versioned document. Pure (zod only, client-safe). A design is plain
// JSON on purpose: it can later be shared, and installed from a design shop, as is.
import { z } from "zod";

export const designModes = ["system", "light", "dark"] as const;
export type DesignMode = (typeof designModes)[number];

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

export interface PersonalizationDto { version: 1; design: DesignDto; sidebar: SidebarDto }

export const defaultDesign: DesignDto = { mode: "light", colors: ["#c9b8a6"], intensity: 0, grain: 0, accent: null };
export const defaultSidebar: SidebarDto = { order: [...sidebarEntries], hidden: [] };
export const defaultPersonalization: PersonalizationDto = { version: 1, design: defaultDesign, sidebar: defaultSidebar };

const hex = z.string().regex(/^#[0-9a-f]{6}$/i).transform(value => value.toLowerCase());
const percent = z.number().int().min(0).max(100);
const entry = z.enum(sidebarEntries);

export const designInput = z.object({
  mode: z.enum(designModes),
  colors: z.array(hex).min(1).max(3),
  intensity: percent,
  grain: percent,
  accent: hex.nullable(),
}).strict();

/** PUT /api/v1/settings/personalization: the whole document is replaced; the trust boundary for both apps. */
export const personalizationInput = z.object({
  version: z.literal(1),
  design: designInput,
  sidebar: z.object({
    order: z.array(entry).max(sidebarEntries.length).refine(list => new Set(list).size === list.length, "Each sidebar entry once."),
    hidden: z.array(entry).max(sidebarEntries.length),
  }).strict(),
}).strict();

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
