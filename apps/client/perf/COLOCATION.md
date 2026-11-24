# Co-locating the API and the database

**Done on 2026-11-24 (your go-ahead).** Production now runs on Neon project `todalo-eu`
(`quiet-math-27103086`, aws-eu-central-1, main branch, endpoint `ep-bitter-sun-bhtrslg8`, max 8 CU,
no suspend). Window: API stopped ~12:04 UTC, final dump 12:05:50, restore done 12:06:32, all 44
tables identical (213 rows, 48 migrations), `sync_changes` cleared (clients' old cursors are
ahead of the new database's, so they do a full refresh; see sync-delta.ts), `DATABASE_URL`
switched on `todalo-api` and `todalo` (production and preview scopes), `TODAY_READ_PARTS=1` on
the API; both apps back by ~12:07:30 (API) and ~12:08:50 (web), same commit `152dd40`. New
connections went to Frankfurt and none to Oregon afterwards.

**Rollback:** the old `habito` / `production` branch (`ep-lively-dew-afh6roei`, us-west-2) is
untouched as of 12:05 UTC. Pointing `DATABASE_URL` back loses every write made since the switch,
so copy those back first (same dump/restore the other way).

The rest of this file is the plan and the measurements that led to it.

## Why

| | now |
|---|---|
| API | Coolify on Hetzner `95.217.114.185` (Helsinki), behind Cloudflare |
| Database | Neon project `habito` (`holy-morning-12568439`), **aws-us-west-2 (Oregon)**, PG 17; production = branch `production` |
| One query from the API | ~196 ms (measured from Zurich; Helsinki is similar) |
| A ~100 KB answer after 5 s idle | ~780 ms (TCP slow start; Neon's HTTP answers are uncompressed) |

After the app-side work (`RESULTS.md`), almost every server wait is 1–2 of those round trips:
reads ~200 ms, edits and completions ~400 ms, other-device sync ~430 ms. Neon can't move a
project between regions, so co-locating means a new project, or a new API host.

## Recommended: a Neon project in aws-eu-central-1 (Frankfurt)

It's the Neon region nearest Helsinki. Frankfurt ↔ Helsinki is typically ~20–25 ms round trip
(estimate: verify with the probe below from the Hetzner host before deciding).

Expected effect (round trip 196 → ~25 ms; app-side numbers stay as they are):

| | now | expected |
|---|---|---|
| any read (1 round trip) | ~200 ms | ~25–35 ms |
| complete / edit (2 round trips) | ~400 ms | ~50–60 ms |
| Today after idle (slow start) | ~404 ms (4 parallel parts) | ~60–100 ms; set `TODAY_READ_PARTS=1` |
| other-device sync | ~430 ms | ~100 ms (stream + one read) |
| first launch, cold | 440 ms (here) | ~150–200 ms |

The alternative, moving the API to us-west-2 next to the database, puts every European user
~150 ms from the API instead. Not recommended for a Zurich-based user base.

## Probe so far (2026-11-24)

Created on your go-ahead: Neon project **`todalo-eu`** (`quiet-math-27103086`), aws-eu-central-1,
PG 17. It's **empty**, scales to zero after 5 min idle, with a 2 CU ceiling for now. Its connection string is in
`apps/client/perf/.env.colocation` (gitignored). Measured with `db-rtt.ts` from the dev machine (Zurich):

| | us-west-2 (now) | eu-central-1 (`todalo-eu`) |
|---|---|---|
| `select 1` p50 | 196 ms | **17 ms** |
| ~100 KB answer after 5 s idle | ~783 ms | **62 ms** |

**The whole app against Frankfurt** (`results/eu-colocated.md`): a separate `perf` branch in
`todalo-eu` (schema migrated, test account and the same 400 seeded tasks; its main branch stays
empty for a production copy), same build, harness run from Zurich (17 ms away), compared with
`final6` (today's setup):

| | us-west-2 (now) | eu-central-1 |
|---|---|---|
| cold load to interactive Today | 440 ms | **139 ms** |
| warm reload | 118 ms | **67 ms** |
| other-device sync | 430 ms | **66 ms** |
| quick add confirmed by the server | 229 ms | **47 ms** |
| complete, server round trip | ~400 ms | **38 ms** |
| API reads (direct) | ~200 ms | **16–23 ms** |
| edit / complete / create / delete (direct) | 396 / 404 / 206 / 206 ms | **37 / 39 / 22 / 22 ms** |

With `TODAY_READ_PARTS=1` against Frankfurt the cold load is the same (137 ms,
`results/eu-colocated-parts1.md`), so the parallel read can be switched off after the move.
Helsinki → Frankfurt is likely a little further than Zurich → Frankfurt, so expect somewhat higher
numbers in production; the probe below gives the exact round trip.

**Measured from the production API container (Hetzner, 2026-11-24 11:54 UTC):** a one-off
Coolify scheduled task on `todalo-api` (your go-ahead; deleted right after) timed HTTPS round trips
from the running container to each Neon endpoint's `/sql` (no credentials):

| | first request (connect) | steady round trip |
|---|---|---|
| current production DB (us-west-2) | 659 ms | **175 ms** |
| `todalo-eu` (eu-central-1) | 165 ms | **24 ms** |

24 ms is under the 40 ms threshold in step 1, so the move is worth doing. Expect production close
to the Frankfurt column above: reads ~25–35 ms, writes ~50–60 ms, other-device sync ~100 ms.

To repeat it yourself: the same probe **from the Hetzner host** (the number that matters), e.g. in the API container
or a shell on `95.217.114.185` with Bun:
`DB_URLS="<current production DATABASE_URL> <EU_DATABASE_URL from .env.colocation>" bun apps/client/perf/db-rtt.ts`.
If the full move goes ahead, raise the compute to production's settings (max 8 CU, no suspend) first.

## Steps

1. **Measure first (read-only).** On the Hetzner host:
   `DB_URLS="<current production url> <new project url>" bun apps/client/perf/db-rtt.ts`.
   Go ahead if the new `select 1` p50 is under ~40 ms.
2. **Create** a Neon project in `aws-eu-central-1`, Postgres 17, with the same compute limits
   (min 0.25, max 8 CU) and no suspend (`suspend_timeout_seconds: 0`, as today).
3. **Copy** the `production` branch in a short maintenance window:
   - stop the `todalo-api` application in Coolify (writes stop; the web client shows offline)
   - `pg_dump --format=custom --no-owner --no-acl "$OLD" > todalo.dump`
   - `pg_restore --no-owner --no-acl --dbname "$NEW" todalo.dump`
   - compare row counts per table (`select relname, n_live_tup from pg_stat_user_tables`, run
     `analyze` first) and the drizzle migrations table
   - Sessions and accounts come along, so users stay signed in.

   Zero-downtime alternative: logical replication from the old project. It needs
   `enable_logical_replication` on `habito`, which can't be turned off and restarts its computes.
   Only worth it if a few minutes' pause is unacceptable.
4. **Switch:** set `DATABASE_URL` for `todalo-api` (and for the `todalo` app if it reads the DB),
   plus `TODAY_READ_PARTS=1`, then redeploy. Smoke test: sign in, Today loads, add, complete
   and edit a task, a second device sees it.
5. **Keep the old project untouched** for a few days. Rollback = point `DATABASE_URL` back.
   Writes made after the switch would need copying back, so decide within the first hour.
6. **Development:** create `main`/test branches in the new project (or keep dev on the old
   one). Update the root `.env` and the memory note about which database is main.
7. **Re-measure** with this harness (`bun perf/run.ts --label after-colocation --compare final6`)
   using a branch of the new project in `perf/.env.perf`.
