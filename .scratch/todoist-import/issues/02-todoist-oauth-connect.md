# 02. Connect Todoist with OAuth (server)

Status: resolved
Type: task

**Blocked by:** None (needs a registered Todoist app and `TODOIST_CLIENT_ID`/`TODOIST_CLIENT_SECRET` for live checks).

**What it delivers:** Import session storage, `POST /api/v1/imports/todoist/connect`, `GET /api/v1/imports/todoist/callback`, `DELETE /api/v1/imports/todoist`, and the "Return to todalo" page.

**Acceptance:** State is random, single-use, user-bound and expires after 10 minutes; replayed/forged/expired state is rejected; Todoist denial is shown and recorded. The access token is encrypted at rest, never returned, logged or put in a URL. Endpoints require a session except the callback. Tests use a fake Todoist token endpoint. Document app registration and env in `apps/api` README and `.env.example`.

## Comments

2026-11-06 — Done in `apps/api/src/import-routes.ts` + `todoist.ts`, tests in `import-routes.test.ts`. Todoist app "todalo for Todoist" (id 751910) registered with localhost:3000 and todalo.bleat.ch callbacks; credentials in the root `.env`. Deviation: sessions and tokens live only in API memory (never persisted, so no at-rest encryption needed); a restart means reconnecting. Token is revoked after a run or disconnect.
