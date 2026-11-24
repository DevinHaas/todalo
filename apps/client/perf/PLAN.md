# Performance plan

Ranked by expected gain against effort and risk, from the baseline in `results/baseline.md`
(harness: `README.md`). Gain is for the scenario named; ms are p50 on this machine, which sits
about as far from Neon (us-west-2) as production does (Hetzner Helsinki).

What the baseline shows:

- **Loads are entirely network-bound.** Cold and warm loads both take ~2.4–2.8 s to an
  interactive Today, even though JS is cached on warm loads (1 KB transferred) and FCP is 56 ms.
  The chain: `/account` (780 ms) → 11 parallel reads → `/today` ends at ~2.7 s.
- **Every API route takes 3–5 sequential DB round trips at ~196 ms each.** Even a 0.1 KB
  settings read takes 590 ms. The session check alone is ~2 round trips per request, and
  writes are slower still (complete 1.37 s, create ~2.4 s until "Added").
- **Renders aren't scoped.** Every interaction re-renders all ~490 task rows (~4,000 component
  renders for one checkbox; ~17k for an Inbox revisit). That costs ~85–170 ms of main thread
  per action and adds TBT on tab switches.
- **Upcoming is heavy:** 11.5k DOM nodes, 734 composers, 337–459 ms per tab switch, and 8
  janky frames while scrolling.
- **The bundle is one 2.7 MB chunk (811 KB gz):** three.js (849 KB, only for Settings' badge),
  PostHog (471 KB) and FeatureSpace with modern-screenshot, all parsed at startup.
- **Native:** reqwest had no gzip/brotli, so the app pulled `/today` raw (170 KB vs 11 KB br) on
  every read.

| # | Item | Expected gain | Effort | Risk | Status |
|---|---|---|---|---|---|
| 1 | **Co-locate API and database** (Neon project in eu-central-1 next to Hetzner Helsinki, or the API in us-west-2) | every query ~196 → ~5–25 ms; routes ~590 → ~60 ms; writes ~1.4 s → ~0.15 s; loads −1.5 s | L (data migration, cutover) | High; needs your go-ahead, outward-facing | **proposal: needs your decision** |
| 2 | **Persist the query cache and last account** (IndexedDB), render from cache and revalidate | warm load / app launch 2.4 s → ~0.2 s; reads start at t=0 | M | Medium (stale-while-revalidate, cleared on sign-out) | **done**: warm load 2441 → 122 ms |
| 3 | **Session-verification cache in the API** (per-token, short TTL, cleared by any `/api/auth` call for that token; one lookup per request, shared with the after-response publish) | −2 round trips per request: ~590 → ~200 ms on every read, writes −400 ms, sync −800 ms | S | Medium (revocation can lag by the TTL) | **done**: reads 590 → 200 ms |
| 4 | **Scoped row renders**: memoised `TaskRow`, children map built once per list, stable actions and contexts | complete / edit / add / sheet: ~4,000 → ~50 renders, ~110 → ~30 ms; tab switches −50% | M | Low | **done** (+ style-recalc fixes): complete 113 → 62 ms |
| 5 | **Code-split the startup bundle**: lazy Settings (three.js), UI gallery, FeatureSpace, PostHog | initial JS 811 → ~540 KB gz; less parse on phones | S | Low | **done (step 1)** |
| 6 | **Native compression** (reqwest gzip+brotli; identity for the SSE stream) | native `/today` 170 → ~11 KB per read | S | Low | **done** |
| 7 | **Fewer sequential queries per write**: `getOwnedTask` in parallel; the write and its re-read batched | create/complete −1–2 round trips | S–M | Low | **done**: complete 1367 → 594 ms server |
| 8 | **Upcoming render cost**: `content-visibility` on day sections; one composer per open day instead of per day | tab:upcoming 340 → ~150 ms, scroll jank → 0 | S–M | Low | **done** (windowed days, `content-visibility`): tab 337 → 132 ms |
| 9 | **Query freshness**: `staleTime` so tab switches and focus don't refetch everything (live sync already pushes changes) | fewer refetches and re-renders, less server load | S | Low | **done** |
| 10 | **Sync path**: live event carries the version, and the client skips the `/sync` pull when its own write already applied it | other-device sync 2.9 s → server write + ~1 round trip | M | Medium | **done**: live frames carry the write; other-device sync 2862 → ~420 ms |
| 11 | **List virtualisation** (only if 4 and 8 leave scroll jank at 1,000+ rows) | scroll on huge lists | M | Medium | **checked; progressive rendering instead**: at ~1,350 rows scrolling has 0 janky frames (p95 17 ms, also at 4× CPU), so no virtualisation. The mount cost of a tab switch is cut by rendering the first 30 rows, then the rest a frame later (step 22: 4× CPU first rows −13 to −25%). The O(n²) list code the test exposed is fixed (step 20) |
| 12 | **Tauri IPC**: measure with CrabNebula DevTools (`--features devtools`); batch startup reads into one command if IPC overhead shows | native startup | M | Low | **measured, not needed**: in the running Mac app (`perf/ipc-bench.ts`) an invoke round trip is < 1 ms (p50 0, p95 1 ms at WebKit's 1 ms timer), a 170 KB payload 5 ms, 15 parallel invokes 3 ms in all; Keychain read 1.2 ms, JSON re-serialise 0.6 ms. Batching startup reads would save nothing measurable |

Progress and numbers: `RESULTS.md`. Also done (found by profiling): forced style recalcs from
`PersonalizationSync` and the liquid bar, `Button`'s forced layout, first-launch Today read
alongside the account check (cold load 2774 → 875 ms). Item 1 waits for your call: it
dwarfs everything else in production, but it is an infrastructure migration.

## Second pass (done, numbers in `RESULTS.md`)

- **Live frames carry the write:** a task write's `sync` frame includes the written task (or deleted
  ID), and devices apply it before pulling. Other-device sync 1217 → 421 ms.
- **One-query session lookups:** Better Auth's `experimental.joins` (session and user in one
  query). `/account` 4 → 2 queries; plus member number cached for 10 min.
- **Writes answer from the written row** instead of reading it back: create 1 round trip
  (was 2), complete 2 (was 3). Edits read in parallel; label replace is one batch; delete is
  one statement with the calendar event removed after the answer.
- **Poll 60 s → 5 min.** It's the safety net under live sync, which catches up on connect and
  resume; ritual readiness is computed on the client, so it doesn't depend on polling.
- **Today collection windowed:** tasks completed more than 30 days ago leave `/today` unless an
  open tree still shows them (ancestors, completed children of open tasks); the open count still
  uses the full list.
- **Sidebar project links prefetch** their page's read on hover or focus.
- **Sentry after startup** (errors before it are buffered) and a stable composer form ref (the
  inline ref blurred the focused field on every keystroke's render).

Tried and reverted: **React Compiler** (`reactCompilerPreset`, `results/step13-*.md`). Startup JS
+93 KB gz; at 4× CPU some interactions improved 11–26%, but first Inbox visit regressed at 1×
(~50 → 133 ms), typing and complete were unchanged, and the unit tests don't run compiled output.
Not clearly better, so not kept.

Found late: **a large database answer is slow after a few seconds' idle.** Neon's HTTP answers
are uncompressed, and an idle connection restarts TCP slow start, so the ~100 KB Today read
took ~790 ms instead of 200 ms. Leaner columns and SQL-side windowing brought it to ~593 ms.
Splitting the read over parallel connections would shave more, but it's a workaround that
co-location makes pointless.

Checked and left as is: production already serves hashed assets `immutable` and the HTML
`no-cache`; Base UI is imported per component and tree-shaken; the composer's remaining ~29
renders per keystroke cost < 6 ms at 4× CPU; splitting the sidebar-bearing screen modules further
would save 10–30 KB gz each but means restructuring files with uncommitted work.

## Considered: done after all, or measured and dropped

- **Composer chips memoised (done):** renders while typing −65%; time unchanged, typing was at the
  floor already.
- **Today read split over parallel connections (done):** ~593 → 404 ms after idle; set
  `PARTS = 1` in `today.ts` once the database is co-located.
- **React Compiler:** tried, reverted (see above).
- **Full list virtualisation:** bounded by measurement. Its first paint equals progressive
  rendering's (both render about a screenful: Inbox 144 ms at 4× CPU, step 22). What it would add is
  skipping the second pass: ~60 ms of main-thread work at 4× CPU on a 400-row Inbox, after the user
  already sees the list, plus DOM memory. Scrolling has 0 janky frames at 1,350 rows. Costs: keyboard
  navigation, selection ranges, drag and drop and find-in-page all assume every row is in the DOM.
- **Further bundle splitting:** measured. The dialog hosts' state stores are imported across
  modules, so only their inner sessions could move out: ~5–8 KB gz of 480 (~1.5%), ~1–2 ms of
  parse at 4× CPU. Not worth carving new files out of modules with uncommitted work.
- **Caching the native Keychain token in memory:** measured 1.2 ms per read; not worth holding
  the token in process memory.
- **Raw IPC responses** (skip the Rust JSON re-serialise): measured 0.59 ms p50 for a 170 KB
  `/today` body (release build, Mac) on a ≥200 ms read.
- **Service-worker app shell (done, step 19):** `index.html` revalidation measured at 77 ms p50
  from Zurich; with that latency, a warm web relaunch goes 207 → 114 ms. Deploy skew tested.
- **ETags on polling:** measured at ≤12 KB brotli per 5-min poll (~147 KB/hour per open device),
  and each poll would still query the database. No latency or server-work gain.

## Left open

- **Item 1, co-locating the database and API:** measured against a Frankfurt branch (cold load
  440 → 139 ms, sync 430 → 66 ms, reads ~200 → ~20 ms). From the production container: 175 → 24 ms per
  round trip. Production isn't moved: that needs your maintenance window (`COLOCATION.md` steps 2–5). The runbook with steps,
  rollback and expected numbers is `COLOCATION.md`, and `db-rtt.ts` is the read-only probe to
  run on the API host first. The parallel Today read then switches off with `TODAY_READ_PARTS=1`
  (no code change).
