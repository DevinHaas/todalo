# 05. Verification and rollout

Status: resolved
Type: task

**Blocked by:** 01–04.

**What it delivers:** `bunx vitest run`, `bunx tsc --noEmit` in each touched package, `cargo test` in `apps/client/src-tauri`; user-approved `drizzle-kit migrate` and backfill run against Neon; browser check of detail sheet and list rows in dark and light themes; `docs` note if any.

**Acceptance:** All green; screenshots compared with the references.

## Comments

2026-11-06: Done: `bunx vitest run` 728 passed; `tsc --noEmit` clean in db, server, api, client, web, ramble, auth; `cargo test` 44 passed.
