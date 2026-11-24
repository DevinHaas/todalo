# Perf harness

Repeatable performance baseline for the web client, the API and the bundle. Every number in
`RESULTS.md` comes from this harness, so a change can be measured by rerunning it.

```sh
cd apps/client
bun perf/run.ts --label baseline                 # full run, 5 samples per scenario
bun perf/run.ts --label after-x --compare baseline
bun perf/run.ts --label quick --runs 2 --only load,tabs --skip-build
bun perf/run.ts --label phone-cpu --cpu 4        # CDP CPU throttle (rough phone proxy)
```

Output: `perf/results/<label>.md` (tables) and `.json` (summary + every sample), plus
`perf/results/bundle.html` (treemap of the prod bundle, rollup-plugin-visualizer).

## What it does

1. **Builds** the client twice into `perf/.build/` (gitignored): `prod` (the real minified
   build, `ANALYZE=1` for the treemap) and `scan` (`PERF_REACT_SCAN=1`: unminified, with
   [React Scan](https://github.com/aidenybai/react-scan) imported before React; `perf/scan-entry.ts`).
2. **Starts an isolated stack** (`stack.ts`): the API on port 3101 against the **perf Neon
   branch** (`perf/.env.perf`, gitignored: `DATABASE_URL=…`; the script refuses the root `.env`
   database), with `DB_QUERY_LOG=1` so each query is logged and counted; `vite preview` of the two
   builds on 4173 (prod) and 4174 (scan), proxying `/api` to it.
3. **Resets the data** (`seed.ts`): signs in `tester@todalo.local`, deletes the previous run's
   completions and adds, and tops up 400 `Perf seed …` tasks (250 Today, 100 over the next 14
   days, 50 Inbox).
4. **Scenarios** (Playwright Chromium, 1440×900). `probe.js` is injected before the app and
   measures from the trusted input event (`pointerdown`/`keydown` timestamp) to the first frame
   after the expected DOM change, plus Event Timing (INP-style) and long tasks (TBT):
   - `load:cold` (fresh context, empty HTTP cache, signed-in) and `load:warm` (reload) to an
     interactive Today with rows; FCP, LCP, TTFB, JS KB, API waterfall
   - `tab:*` Inbox / Today / Upcoming via the sidebar (first visit and revisit)
   - `sheet:open`, `sheet:type`, `edit:title` (Enter in the sheet → the list row's new title)
   - `complete` (row checks; `server` = the POST's round trip)
   - `composer:open`, `composer:type40` (40 keystrokes; `perKey`), `composer:add`
   - `quickadd:open`, `quickadd:add` (optimistic row; `savedAt` = the server's "Added")
   - `scroll:today`, `scroll:upcoming` (programmatic scroll per frame; p95 frame ms, janky frames > 20 ms)
   - `upcoming:cold` / `upcoming:warm`
   - `sync:other-device`: two contexts; A completes, time until B shows it
5. **Renders**: the same interactions once on the scan build; React Scan's `onRender` counts
   component renders (and unnecessary ones) per interaction.
6. **API routes**: every GET the app made, called directly 10× (p50/p95), DB queries per
   request, body size raw/gzip/brotli and the served `content-encoding`; plus the writes
   (create, patch, complete, delete).
7. **Bundle**: initial JS/CSS raw and gzip, chunk count, largest chunks.

Notes: the dev machine (Zurich) to Neon us-west-2 is ~196 ms per query, close to production
(Hetzner Helsinki → Neon us-west-2), so API numbers here approximate production latency.
Variance between runs is ~5-10% on network-bound scenarios; compare p50s.

## Native (Tauri) profiling

- **CrabNebula DevTools**: `bun tauri dev --features devtools` (or
  `bun tauri ios dev "iPhone 17 Pro" --features devtools`) starts the app with
  `tauri-plugin-devtools` (optional dependency, off in every normal build). The console prints a
  link to `devtools.crabnebula.dev`, which shows every IPC command with its spans (command →
  HTTP request) and the logs.
- What was checked natively (by reading and measuring the Rust side): reads are not serialised
  (only sign-in/out/account take the auth gate); a Keychain token read is ~1.2 ms p50 on macOS
  (`SecItemCopyMatching`, not worth caching the token in memory); a read parses and re-serialises
  its JSON once (~1–2 ms for `/today`). The native wins were transport-level: reqwest had no
  gzip/brotli (now on; the SSE stream asks for identity) and no HTTP/2 (now on, so a launch's
  reads share one connection).
- The webview runs the same client, so every web scenario above applies to the Mac and iOS apps.
  Their launch is the warm-load path: the persisted cache renders Today before any IPC call.

## Database distance

`DB_URLS="<url> <url>" bun perf/db-rtt.ts` (read-only): `select 1` round trip and a ~100 KB
answer after 5 s idle, per database. Run it on the API host to compare databases before a move
(`COLOCATION.md`).

## Native IPC round trip

`PERF_IPC_BENCH=1 bun x vite --port 5180 --strictPort`, then
`bun tauri dev --config '{"build":{"devUrl":"http://127.0.0.1:5180","beforeDevCommand":""}}'`.
The app times `feedback` invokes (no I/O on desktop) and a 170 KB payload, and the bench server
prints an `IPCBENCH {…}` line. Measured: < 1 ms per invoke, 5 ms for 170 KB.

## Profiling one interaction

`bun perf/profile.ts complete|sheet|tab-inbox|tab-upcoming|quickadd [--skip-build]` records a
CDP CPU profile of one interaction on the unminified build (React Scan off via `?noscan`) and
prints the top functions by self and inclusive time. That's how the forced style recalcs and
layouts in `RESULTS.md` were found.
