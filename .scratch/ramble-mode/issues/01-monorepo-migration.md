# 01 — Migrate to a Turborepo monorepo (apps/web, packages/db, packages/auth)

**What to build:** Restructure the repo into a Turborepo monorepo with no change in behavior for the existing app. The current Next.js app moves to `apps/web` unchanged from the user's perspective. The Drizzle schema/client is extracted into `packages/db` and the Better Auth setup into `packages/auth`, both consumed by `apps/web` exactly as before. This is pure infrastructure — it unblocks everything else in this spec (ADR `0004-elysia-monorepo-for-ramble-websocket`) but ships no new user-facing behavior itself.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Turborepo scaffold (`turbo.json`, root workspace config) added
- [ ] Existing Next.js app moved to `apps/web`; `bun run dev` / `bun run build` still boot and behave identically to before the migration
- [ ] Drizzle schema and DB client extracted to `packages/db`, imported by `apps/web` via the workspace package (no schema changes in this ticket)
- [ ] Better Auth config extracted to `packages/auth`, imported by `apps/web` via the workspace package (same session/cookie behavior as before)
- [ ] All existing routes, Server Actions, and tests (if any) continue to pass after the move
