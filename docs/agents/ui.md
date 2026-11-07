# Client UI: build only from `src/ui`

The client (`apps/client`) has one component library, `apps/client/src/ui`
(vendored Toolcraft UI by Pixel Point, MIT: `src/ui/LICENSE.md`,
`src/ui/NOTICE.md`), built on React 19, Tailwind v4, Base UI and cva, re-skinned
to look like Todoist.

## Rules

- Build every new or touched screen from `src/ui` exports (`import { Button, Field, … } from "./ui"`)
  and Tailwind utilities that read theme tokens (`bg-background`, `text-muted-foreground`,
  `border-border`, `h-control`, `h-row`, `rounded-lg`, `shadow-popover`, `text-xs-plus`…).
- No ad-hoc control CSS: no new rules in `src/styles.css` for buttons, inputs, switches,
  menus, dialogs, chips or rows, and no hex/rgb values or magic sizes in components.
  If a value is missing, add a token to `src/ui/theme.css` (the ONE token file) and use it.
- Page anatomy comes from `ui/components/composites/page.tsx`: `PageHeader`, `PageSection`,
  `List`/`ListRow`, `Hint`, `SidebarSectionHeader`, `sidebarItemClassName`.
- Wrap a library screen's root in `className="ui"` (scoped preflight). Do not put `ui` on an
  element that also carries legacy classes: the reset would strip their margins.
- The reset also covers everything inside an element with `data-slot` (every library part sets it).
  A composite that wraps arbitrary children (e.g. `ContextMenuTrigger` around task rows) must not set
  `data-slot`, and a library trigger must not `render` onto a legacy element: render a library
  component (`Button`) instead. `ui-scope.test.ts` checks the context-menu wrapper.
- `src/styles.css` is legacy, layered below Tailwind (`@layer legacy` in `src/ui/styles.css`).
  Migrate a legacy screen when a ticket touches it, then delete its CSS.
- Keep keyboard hooks: commands click or focus `data-*` attributes (`data-season-action`,
  `data-field`, …); pass them to the library component, which forwards them.
- `/ui` (keyboard `o then c`) shows every component and state, light and dark. Add new components there.

## Adding a shadcn component

`apps/client/components.json` (style `base-nova`, Base UI, lucide) points `ui` at
`src/ui/components/composites`.

1. `cd apps/client && bunx shadcn@latest add <name>`.
2. If it asks to overwrite or add a component that already exists (button, input, … live in
   `src/ui/components/primitives`), decline and change its import to `../primitives`.
3. Revert any CSS variables it writes into `src/ui/theme.css`; map colours to the existing
   `--color-*` tokens instead.
4. Export it from `src/ui/components/composites/index.ts` and add it to the gallery.

## Checklist before finishing UI work

- [ ] Light and dark both checked (`/ui` and the screen itself; theme toggles with `o then t`).
- [ ] Keyboard: every control reachable with Tab, a visible focus ring, Escape closes popups
      without closing the sheet or dialog behind them, existing commands still work.
- [ ] Compact density: controls `h-control` (32px) or `h-control-sm`, rows `h-row`/`min-h-row`,
      14px body (`text-sm`), 13px controls (`text-xs-plus`).
- [ ] Only tokens: no new colours, sizes or shadows outside `theme.css`.
- [ ] Removed the legacy CSS the screen no longer uses.
