// Theming reference (public API): the CSS variables a custom theme overrides, the
// `data-region` hooks on the app's major parts, and the prompt a user pastes into an AI
// assistant to write their custom CSS. Renaming a variable or region breaks users' themes.

export type ThemeGroup = "surface" | "brand" | "status" | "line" | "sidebar" | "font" | "text" | "spacing" | "radius" | "shadow" | "design";
export interface ThemeVariable { name: `--${string}`; group: ThemeGroup; description: string }
export interface ThemeRegion { region: string; description: string }

const groupTitles: Record<ThemeGroup, string> = {
  surface: "Surfaces and text", brand: "Brand and buttons", status: "Status and priority", line: "Borders and focus",
  sidebar: "Sidebar", font: "Fonts", text: "Text sizes", spacing: "Sizes", radius: "Corners", shadow: "Shadows", design: "Appearance",
};

/** Defined in ui/theme.css (light on `:root`, dark on `:root.dark`), or set by personalization.ts. */
export const themeVariables: readonly ThemeVariable[] = [
  { name: "--color-background", group: "surface", description: "page background" },
  { name: "--color-foreground", group: "surface", description: "main text" },
  { name: "--color-muted", group: "surface", description: "quiet fills: hover, chips" },
  { name: "--color-muted-foreground", group: "surface", description: "secondary text" },
  { name: "--color-subtle-foreground", group: "surface", description: "hints, placeholders, icons" },
  { name: "--color-card", group: "surface", description: "cards" },
  { name: "--color-card-foreground", group: "surface", description: "text on cards" },
  { name: "--color-popover", group: "surface", description: "menus, popovers, dialogs" },
  { name: "--color-popover-foreground", group: "surface", description: "text in popovers" },
  { name: "--color-accent", group: "surface", description: "hovered menu item or row" },
  { name: "--color-accent-foreground", group: "surface", description: "text on accent" },
  { name: "--color-selected", group: "surface", description: "selected rows, pressed toggles" },

  { name: "--color-brand", group: "brand", description: "brand colour (todalo red)" },
  { name: "--color-brand-hover", group: "brand", description: "brand on hover" },
  { name: "--color-brand-tint", group: "brand", description: "current sidebar item" },
  { name: "--color-brand-tint-foreground", group: "brand", description: "text on brand tint" },
  { name: "--color-primary", group: "brand", description: "primary buttons" },
  { name: "--color-primary-foreground", group: "brand", description: "text on primary buttons" },
  { name: "--color-secondary", group: "brand", description: "secondary buttons" },
  { name: "--color-secondary-foreground", group: "brand", description: "text on secondary buttons" },
  { name: "--color-secondary-hover", group: "brand", description: "secondary buttons on hover" },
  { name: "--color-link", group: "brand", description: "links" },

  { name: "--color-destructive", group: "status", description: "delete, errors" },
  { name: "--color-destructive-foreground", group: "status", description: "text on destructive" },
  { name: "--color-attention", group: "status", description: "warnings" },
  { name: "--color-success", group: "status", description: "success, on track" },
  { name: "--color-today", group: "status", description: "today's dates" },
  { name: "--color-priority-1", group: "status", description: "priority 1 (highest)" },
  { name: "--color-priority-2", group: "status", description: "priority 2" },
  { name: "--color-priority-3", group: "status", description: "priority 3" },
  { name: "--color-priority-4", group: "status", description: "priority 4 (none)" },

  { name: "--color-border-subtle", group: "line", description: "list dividers" },
  { name: "--color-border", group: "line", description: "inputs, cards, popovers" },
  { name: "--color-border-hover", group: "line", description: "borders on hover" },
  { name: "--color-border-strong", group: "line", description: "focused field, open menu trigger" },
  { name: "--color-input", group: "line", description: "input borders" },
  { name: "--color-field", group: "line", description: "input fill" },
  { name: "--color-field-hover", group: "line", description: "input fill on hover" },
  { name: "--color-ring", group: "line", description: "keyboard focus ring" },
  { name: "--focus-ring-width", group: "line", description: "focus ring width" },

  { name: "--color-sidebar", group: "sidebar", description: "sidebar background" },
  { name: "--color-sidebar-foreground", group: "sidebar", description: "sidebar text" },
  { name: "--color-sidebar-accent", group: "sidebar", description: "hovered sidebar item" },
  { name: "--color-sidebar-accent-foreground", group: "sidebar", description: "text of a hovered item" },
  { name: "--color-sidebar-border", group: "sidebar", description: "sidebar edge" },

  { name: "--font-sans", group: "font", description: "interface font stack" },
  { name: "--font-mono", group: "font", description: "monospace font stack" },
  { name: "--font-weight-medium", group: "font", description: "medium weight" },
  { name: "--font-weight-semibold", group: "font", description: "titles weight" },

  { name: "--text-xs", group: "text", description: "12px: meta lines" },
  { name: "--text-xs-plus", group: "text", description: "13px: buttons, menus" },
  { name: "--text-sm", group: "text", description: "14px: body text" },
  { name: "--text-xl", group: "text", description: "20px: dialog titles" },
  { name: "--text-2xl", group: "text", description: "26px: page titles" },

  { name: "--spacing", group: "spacing", description: "4px step behind most padding and gaps" },
  { name: "--spacing-control", group: "spacing", description: "button and input height" },
  { name: "--spacing-row", group: "spacing", description: "list row height" },
  { name: "--spacing-sidebar-item", group: "spacing", description: "sidebar row height" },
  { name: "--spacing-sidebar", group: "spacing", description: "sidebar width" },
  { name: "--spacing-page", group: "spacing", description: "page column width" },

  { name: "--radius-sm", group: "radius", description: "chips, small controls" },
  { name: "--radius-md", group: "radius", description: "small buttons" },
  { name: "--radius-lg", group: "radius", description: "buttons, inputs, menu items" },
  { name: "--radius-xl", group: "radius", description: "popovers, cards, dialogs" },
  { name: "--radius-2xl", group: "radius", description: "large panels" },

  { name: "--shadow-sm", group: "shadow", description: "small raise" },
  { name: "--shadow-md", group: "shadow", description: "cards" },
  { name: "--shadow-lg", group: "shadow", description: "floating panels" },
  { name: "--shadow-popover", group: "shadow", description: "menus, popovers" },
  { name: "--shadow-dialog", group: "shadow", description: "dialogs" },

  { name: "--design-sidebar", group: "design", description: "sidebar background (gradient, grain)" },
  { name: "--design-grain", group: "design", description: "grain tile; none removes it" },
  { name: "--design-corners", group: "design", description: "scales every radius: 0 sharp, 1 soft, 1.6 round" },
  { name: "--design-panel-border", group: "design", description: "sidebar and settings edge" },
  { name: "--design-glass", group: "design", description: "panel opacity with glass, e.g. 60%" },
  { name: "--design-blur", group: "design", description: "blur of the colour wash behind glass" },
  { name: "--design-backdrop", group: "design", description: "colour wash behind glass" },
  { name: "--design-wallpaper", group: "design", description: "wallpaper image, set on html::before" },
  { name: "--design-scrim", group: "design", description: "veil over the wallpaper" },
  { name: "--design-surface", group: "design", description: "page fill with glass" },
  { name: "--design-panel", group: "design", description: "dialog and bar fill with glass" },
  { name: "--design-fill", group: "design", description: "chip fill with glass" },
  { name: "--design-frost", group: "design", description: "backdrop-filter of floating panels" },
];

/** Every name is on an element as `data-region="…"` in apps/client/src. */
export const themeRegions: readonly ThemeRegion[] = [
  { region: "app", description: "the whole app: sidebar and page" },
  { region: "sidebar", description: "left sidebar" },
  { region: "sidebar-nav", description: "navigation lists in the sidebar" },
  { region: "toolbar", description: "bar above the page" },
  { region: "content", description: "page column" },
  { region: "task-list", description: "a list of tasks (Today, Upcoming, projects, labels, filters)" },
  { region: "task-row", description: "one task in a list" },
  { region: "board", description: "board layout" },
  { region: "calendar", description: "week and month calendar layout" },
  { region: "schedule", description: "hour grid of a calendar" },
  { region: "composer", description: "add-task form" },
  { region: "quick-add", description: "quick add dialog" },
  { region: "task-sheet", description: "task details dialog" },
  { region: "dialog", description: "other dialogs" },
  { region: "settings", description: "settings dialog" },
  { region: "quick-find", description: "search dialog" },
  { region: "command-palette", description: "command palette" },
  { region: "coach-bar", description: "Coach bar at the bottom of the page" },
  { region: "coach", description: "Coach sidebar (chat)" },
  { region: "plan", description: "Plan sidebar beside the calendar" },
  { region: "ritual", description: "ritual sidebar (plannings, reviews)" },
];

/** Copy-ready prompt for any AI assistant; the user adds their wish under "My theme". */
export function customCssPrompt(): string {
  const variables = (Object.keys(groupTitles) as ThemeGroup[]).map(group =>
    `### ${groupTitles[group]}\n${themeVariables.filter(v => v.group === group).map(v => `- ${v.name}: ${v.description}`).join("\n")}`);
  return `# Write a custom CSS theme for todalo

todalo is a task app (web, Mac, iPhone). Write one custom CSS file that restyles it to match my theme below.

## Output
- One plain CSS file in a single code block, with short comments. No Sass, no JavaScript, no HTML.
- Before the code, at most three lines on the idea.

## How to theme
- Prefer overriding the variables below. Light values go on \`:root\`, dark values on \`:root.dark\`. Always set both, or dark mode keeps your light colours.
- Colours can be any CSS colour, including translucent ones (rgb(0 0 0 / 0.4)) and color-mix().
- For structure (translucent panels, borders, blur, spacing) use the region hooks: \`[data-region="sidebar"]\`, \`[data-region="task-row"]\` and so on. Do not rely on class names; they change without notice.
- This file wins over Settings > Appearance (accent, colours, font, corners, borders, glass): set only what you want to change, no !important needed.
- Some older screens use fixed sizes; when a variable does not reach an element, target its region.

## Rules
- No @import.
- No remote url(): only data: URLs (small images, e.g. a wallpaper or texture). The app blocks network requests from themes.
- No web fonts: use font stacks of fonts already on the device (system-ui, ui-monospace, Menlo, Georgia).
- Keep text readable: at least 4.5:1 contrast for text, 3:1 for icons, borders and the focus ring, in light and dark.
- Keep the keyboard focus ring visible. Do not hide regions, buttons or text.
- Keep layout sizes close to the defaults so nothing overflows, also on a narrow phone screen.

## Variables
${variables.join("\n\n")}

## Regions
${themeRegions.map(r => `- ${r.region}: ${r.description}`).join("\n")}

## My theme
<describe it, paste reference images or links>
`;
}
