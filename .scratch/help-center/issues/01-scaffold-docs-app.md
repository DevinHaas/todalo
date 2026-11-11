# 01. Scaffold the docs application

Status: resolved
Type: task

**Blocked by:** None.

Spec: `.scratch/help-center/spec.md` (Application and deployment, Theme). Research notes: `/Users/devinhasler/projects/todalo-help-center-notes/`.

**What it delivers:** A new `apps/docs` workspace app (Next + Fumadocs, MDX in the repo) that builds and runs under the existing Bun workspace and Turbo pipeline. Brand fonts and colour tokens copied in from the marketing app, light and dark themes (system default, remembered choice), slim footer, one placeholder article proving MDX renders. A Dockerfile for a standalone build, following the pattern of the existing root Dockerfile.

**Acceptance:** `bun run build` and the root test command pass. The app starts locally and shows the placeholder article in both themes. No imports from `apps/client` or `apps/web`. Read `AGENTS.md` on the Next version before starting. If the research notes say Fumadocs does not support this Next version, use the fallback named in the spec and say so in Comments.

## Comments

### 2026-11-11: resolved (branch `help-center-01-scaffold`)

Built `apps/docs` (`@todalo/docs`): Next 16.2.10 with headless Fumadocs (`fumadocs-core` 16.18.4, `fumadocs-mdx` 15.5.3, no `fumadocs-ui`). The research notes confirm Fumadocs supports this Next version, so the spec's fallback was not used.

What is there:

- `content/get-started/placeholder.mdx` rendered at `/get-started/placeholder` by `app/[category]/[article]/page.tsx` (folder = category, file = article). `app/page.tsx` is a stand-in landing that lists every page.
- `lib/source.ts` is the plain Fumadocs loader over `content/`. `source.config.ts` uses the stock frontmatter (title, optional description).
- `app/globals.css` holds the tokens (badge palette: paper `#f6f5f2` / ink `#111110`, dark `#121211` / `#ecebe6`, red `#c8342b`) as Tailwind colours `paper`, `ink`, `brand`, plus `font-sans` (Geist) and `font-display` (Sanela, copied to `app/fonts/sanela`). Article body styles are the `.article` rules in the same file.
- Theme: `lib/theme.ts` exports the inline `<head>` script (system setting until a choice is stored under `localStorage["todalo-help-theme"]`, values `light` / `dark`) and `components/theme-toggle.tsx` writes the choice. The `dark` class on `<html>` is the switch. Tested in `lib/theme.test.ts`.
- `components/footer.tsx`: Todalo home, privacy, terms, `support@todalo.app`.
- `apps/docs/Dockerfile` (standalone, repo root as context, port 3000, `node apps/docs/server.js`). The root `Dockerfile` and `apps/api/Dockerfile` now copy `apps/docs/package.json` so their frozen installs keep working.
- Scripts: `dev` and `start` on port 3003 (3002 is used by the capture script's second API), `build`, `lint`, `typecheck` (`fumadocs-mdx && tsc --noEmit`), `test`. No `postinstall`. `.source/` is git-ignored.

Checked: `bun run test` passes (129 files, 1777 tests). `bun run build` passes for all four apps when the web app has its env; in a checkout with no `.env` the existing `@todalo/web` build fails collecting page data, as it did before this change (run with the root Dockerfile's placeholder values to reproduce the pass). Docs `typecheck` and `lint` pass. The standalone server was run locally and the placeholder article checked in a browser in both themes: toggle, remembered choice after reload, and system-dark default with no stored choice.

Deviations and things left for later tickets:

- No tests beyond the theme script; the rest is scaffolding.
- The Docker image was not built (nothing is deployed in this ticket). It follows the root Dockerfile and the notes; build it once before the Coolify service is created.
- The `lastModified` plugin, the extended frontmatter schema, the `published` filter and `NextProvider` are not wired; they belong to the content-model and template tickets. Git dates in Docker still need the `.dockerignore` decision from `fumadocs.md`.
- Code that tests import must use relative imports, not `@/` (the root Vitest alias points `@` at `apps/web`). `lib/theme.ts` has no imports for that reason.
- Red links on the dark paper measure about 3.6:1, under the 4.5:1 AA level for body text (light is about 4.8:1). Links are underlined, so they do not rely on colour alone, but a lighter red for dark-mode text is worth deciding in the template ticket.
- `public/todalo-logo.svg` (copied from `apps/web`) is the favicon only; its strokes are black, so it is not used in the header.
