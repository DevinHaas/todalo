# Brief for agents implementing a goals-seasons ticket

Work ONLY in the git worktree `/Users/devinhasler/projects/todalo-goals` (branch `feat/goals-seasons`).

## Read first
- Your ticket in `.scratch/goals-seasons/issues/` and the relevant parts of `.scratch/goals-seasons/spec.md`. Build only your ticket.
- `CONTEXT.md` (use its vocabulary), `docs/adr/` (esp. 0005 stage-then-commit, 0007, 0008), `AGENTS.md`, `docs/agents/*.md`.
- Recent commits on this branch (`git log --oneline main..HEAD`) to reuse what earlier tickets built (e.g. ticket 01 goals: `packages/server/src/goals.ts`, `apps/api/src/goal-routes.ts`, `apps/client/src-tauri/src/goals.rs`, `apps/client/src/goals.ts`, `goal-views.tsx`, `goal-screens.tsx`).

## Architecture
- Bun + Turborepo. DB: Drizzle on Neon (`packages/db`), migrations in `drizzle/` via `bun run db:generate`. Applying with `bun run db:migrate` is allowed (user-approved). Migrations must be additive: never drop or rewrite existing tables/columns.
- Rules live in `packages/server`. Elysia API in `apps/api`: route factories `createXRoutes({ verify, allowedOrigins, ...deps })` wired in `apps/api/src/index.ts`.
- Client: `apps/client` (React 19, react-router, TanStack Query, Vite), wrapped by Tauri 2 for Mac and iPhone and also run in the browser. Native calls go through typed Rust commands in `apps/client/src-tauri/src` registered in `lib.rs`, `build.rs` and `capabilities/default.json`. Follow an existing feature end to end.
- Do NOT extend the legacy Next.js app in `apps/web`.
- UI: follow `docs/agents/ui.md`. Build new UI only from `apps/client/src/ui` components and `src/ui/theme.css` tokens (no ad-hoc control CSS). Goals have a `color` in their DTO.
- Browser checks: API runs on port 3011 (`RAMBLE_PORT=3011`); 3001 and 5173 are taken by other projects. See `docs/qa/ui-library/` for how the last agent ran Vite on a free port. Use the test user, never edit the user's real data in the browser.

## Rules
- Vertical slice: schema, server, API, Rust, client UI, tests. Minimal code, match existing style, reuse existing helpers.
- Every new user action gets a keyboard command in the existing registry (no clashes).
- Tests at the API seam with in-memory fakes (prior art: `apps/api/src/*-routes.test.ts`); pure logic gets table-driven tests in `packages/server`.
- Before finishing: `bun run typecheck` and `bun run test` from the worktree root pass; `cargo check` in `apps/client/src-tauri` if Rust changed.
- Do NOT commit or push. Tick completed acceptance criteria in the ticket; set `**Status:** resolved` only if all are done.

## Final report (under 250 words)
What you built by layer, files touched (paths), migration name and whether applied, test/typecheck/cargo results, decisions the user should know, anything left undone.
