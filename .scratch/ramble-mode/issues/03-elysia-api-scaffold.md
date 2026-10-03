# 03 — `apps/api` Elysia scaffold with Better Auth session verification

**What to build:** A new Elysia server (`apps/api`, Bun-native) that boots independently of `apps/web`, shares `packages/auth`'s Better Auth config, and can verify the session cookie issued by `apps/web`. Deployed as a second Coolify application on the same domain, path-routed so `/api/ramble/*` reaches Elysia while everything else continues to reach `apps/web` (same domain means the session cookie is readable by both without CORS/cross-origin cookie config). No Ramble-specific logic yet — this ticket only proves the server exists, boots, and can identify the logged-in user.

**Blocked by:** 01 (needs `packages/auth` to exist as a shared workspace package).

**Status:** ready-for-agent

- [ ] `apps/api` Elysia app added to the Turborepo workspace, runs under Bun
- [ ] A health-check route (e.g. `GET /api/ramble/health`) responds when the server is running
- [ ] An authenticated route on `apps/api` verifies the same session cookie `apps/web` issues (via `packages/auth`) and returns the current user's id; an unauthenticated request is rejected
- [ ] Coolify: `apps/api` deployed as a second application on the same domain, path-routed so `/api/ramble/*` hits Elysia and all other paths continue to hit `apps/web`
- [ ] ElevenLabs API key is present only in `apps/api`'s server-side environment — not referenced from `apps/web` or shipped to the browser (verified even though this ticket doesn't call ElevenLabs yet)
- [ ] Manually verified in a deployed environment: logging into `apps/web`, then calling the authenticated `apps/api` route from the browser, succeeds using the same session
