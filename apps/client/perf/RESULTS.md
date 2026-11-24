# Perf results

All numbers come from `bun perf/run.ts` (see `README.md`). Each step has its own
`results/<label>.md` and `.json` with every sample. Values are p50 ms, from input to the first
frame after the change (loads from navigation start), on the prod build with 1440×900 Chromium
against the perf Neon branch. "4× CPU" is the same run under CDP CPU throttling, a rough proxy for a phone.

## Summary: baseline → final

`results/baseline.md` → `results/final6.md` (5 runs each, every change included); 4× CPU:
`results/cpu4-step6.md` (the first throttled run, already after steps 1–5) → `results/final6-cpu4.md`.

| scenario | baseline | final | Δ | 4× CPU first → final |
|---|---|---|---|---|
| cold load to interactive Today (first launch on a device) | 2774 | **440** | -84% | 2125 → 620 |
| warm reload / app relaunch | 2441 | **118** | -95% | 473 → 301 |
| switch to Inbox (first visit) | 278 | **58** | -79% | 343 → 169 |
| switch to Inbox (revisit) | 170 | **57** | -66% | 371 → 237 |
| switch to Today | 85 | **37** | -56% | 157 → 104 |
| switch to Upcoming | 337 | **54** | -84% | 423 → 165 |
| open task sheet | 114 | **53** | -53% | 324 → 164 |
| type in the sheet title | 46 | **25** | -45% | 165 → 94 |
| edit title (Enter → row updated) | 88 | **29** | -67% | 167 → 85 |
| complete a task (row checks) | 113 | **31** | -72% | 257 → 137 |
| composer: 40 keystrokes | 61 | **48** | -22% | 362 → 181 |
| composer add (Enter → row) | 96 | **37** | -62% | 162 → 73 |
| quick add: open dialog | 127 | **17** | -86% | 162 → 65 |
| quick add: Enter → row | 177 | **31** | -83% | 306 → 91 |
| Upcoming cold load | 2929 | **469** | -84% | 2190 → 677 |
| Upcoming warm load | 3021 | **137** | -95% | 820 → 356 |
| scroll Upcoming, p95 frame | 39 | **17** | -56% | 28 → 18 |
| sync to another device | 2862 | **430** | -85% |  |
| quick add: Enter → "Added" (server confirmed) | 2435 | **229** | -91% | |
| React renders per completion | 4081 | **177** | -96% | |
| React renders per 40 composer keystrokes | 1160 | **400** | -66% | |

Server, per request (direct to the API, `final6.md`): every read 1 round trip (~200 ms, was ~590); `/account` 198 ms (was 784), create 206 (was ~1700 incl. calendar), edit 396 (was 1204), complete 404 (was 1002), delete 206 (was 400). After a few idle seconds the Today database read is ~404 ms (was ~790), since Neon answers uncompressed and an idle connection restarts TCP slow start (step 18).

API reads: every GET route went from 3–5 sequential DB round trips (~590 ms) to 1 (~200 ms);
`/account` 4 → 3; writes −2–3 round trips each (`results/step6-quick.md`, queries column).

Bundle: initial JS 2716 KB (811 KB gz) → 1584 KB (480 KB gz), −41%; Sentry (when a DSN is set) is a 56 KB gz chunk loaded after startup.

React renders per completion: 4,081 → 1,173 (React Scan, `results/step4-rows.md`).

## Steps

| step | change | measured in | key before → after |
|---|---|---|---|
| 1 | Code split: Settings (three.js) and UI gallery lazy; FeatureSpace and PostHog loaded after startup | `step1-split` | initial JS 811 → 531 KB gz; desktop timings unchanged (network-bound) |
| 1b | Native: reqwest gzip+brotli (identity for SSE), HTTP/2 | compile only | native `/today` 170 KB → ~11 KB per read; one multiplexed connection |
| 2 | API session cache (30 s per token, shared lookups, dropped by any `/api/auth` call, primed by `/account`) | `step5` | every read 590 → 200 ms |
| 3 | Writes: calendar push after the response (per-task queue), `getOwnedTask` and the milestone check in parallel, replay check only with placement | `step5` | complete 1367 → 594 ms server; quick add saved 2435 → 1255 |
| 4 | Memoised task rows (`TaskRowBody`), indexed task tree, stable row actions and dialog callbacks | `step4-rows` | renders per complete 4081 → 1173; complete 113 → 97 |
| 4b | Style recalcs: `PersonalizationSync` repainted `<html>` on every Shell render; the liquid bar read computed style every frame | `step4b-style` | complete 97 → 63; tabs −40–64%; quick add open 113 → 42 |
| 4c | `Button` width via ResizeObserver, not a forced layout per render | profile | sheet open: 40 ms forced layout removed |
| 5 | Persisted query cache (localStorage, buster = app version) + remembered account; `staleTime` 30 s | `step5`, `step6-quick` | warm load 2441 → 122 ms; Upcoming warm 3021 → 264 |
| 6 | Upcoming renders 6 weeks and grows on scroll (was 12 months) | `step6-quick` | Upcoming sections ~370 → 44 |
| 6b | `content-visibility: auto` on task rows | `cpu4-cv` | 4× CPU: −31% to −61% on every interaction |
| 6c | Upcoming date labels without a per-call Intl formatter; `/account` membership in one query | profile | Upcoming render −7 ms; `/account` −200 ms |
| 7 | First launch: Today's read starts alongside the account check | `step7-early` | cold load 1897 → 875 ms |

| 8 | Live `sync` frames carry the written task / deleted ID; devices apply it before the pull | `step8-sync` | other-device sync 1217 → 630 → 421 ms |
| 8b | Better Auth `experimental.joins`; member number cached 10 min | `final3-api` | `/account` 4 → 1 query |
| 8c | Writes answer from the written row; edits read in parallel; labels replaced in one batch; delete in one statement (calendar after) | `final3-api` | create 2 → 1, complete 3 → 2, edit 4 → 2, delete 2 → 1 round trips |
| 8d | Poll 60 s → 5 min (safety net under live sync) | – | ~15 → ~3 requests/min per open device |
| 8e | `/today` drops tasks completed > 30 days ago (unless an open tree shows them) | unit test | payload bounded as history grows |
| 9 | Writes resolve without waiting for their follow-up refetch; Today not refetched after a successful write | `step9-settle` | quick add "Added" 1040 → 233 ms; no 170 KB reload per write |
| 10 | Memoised row wrapper reading a per-row tree slice (store); dialog context stable | `step10b-rowstore` | renders per completion 1167 → 183 |
| 10b | Sidebar project links prefetch their page | – | project page opens with its data |
| 11 | Sentry loaded after startup (errors buffered until then; named imports keep its chunk at 56 KB gz, not 152); composer's form ref made stable (it blurred the field on every keystroke's render) | `step11-composer`, `step11-cpu4` | JS on cold load 531 → 477 KB; 4× CPU: FCP 280 → 244 ms, 40 keystrokes 277 → 232 ms |
| 12 | First browser launch: `public/early.js` starts Today's read before the bundle loads | `step12-early`, `step12-cpu4` | cold load 875 → 826 ms; 4× CPU 1072 → 888 ms |
| 14 | Today and project reads select only the DTO's columns; Today leaves long-completed tasks out in SQL | direct timing | after ≥3 s idle (Neon's TCP slow start, uncompressed answers): Today read 790 → 593 ms; DB answer 103 → 83 KB |
| 15 | Harness: tab switches start 1 s after load (a faster load had the first click land on the startup reads' renders) | `step15-tabs` | first Inbox visit 105 → 58 ms (measurement, not app) |
| 16 | Navigation no longer "clears" an already-empty collapsed set (it re-rendered every row) | `step16-collapse` | row wrapper renders per navigation 800 → 400 |
| 17 | Composer chips extracted into a memoised component (stable schedule actions; `schedule` memoised) | `step17-chips`, `step17-cpu4` | renders per 40 keystrokes 1160 → 400; time unchanged (typing was already ~1.2 ms/key) |
| 18 | Today's read split into 4 parallel queries (hash of ID), merged in manual order | direct timing; identity check with edge cases | after ≥3 s idle: 593 → 404 ms |
| 19 | Web app shell in the service worker (`public/sw.js`: page stale-while-revalidate, hashed assets cache-first; a missing chunk after a deploy reloads once) | `step19-sw` (no regressions); A/B with production's measured 77 ms page round trip; deploy-skew test | warm web relaunch 207 → 114 ms; deploy B served correctly after one reload |
| 20 | Large lists (1,100 extra Today tasks, ~1,350 rows): `treeOrder` was O(n²) (a children filter per task), now one pass (randomised equivalence test); open count hoists "tomorrow"; bulk selection and server label grouping use maps/sets | ad-hoc runs at 1,500 tasks, then cleaned up | complete 86 → 56 ms (4× CPU 343 → 224); scroll 0 janky frames; tab switches 33–43 ms |
| 21 | Native IPC measured in the running Mac app (`PERF_IPC_BENCH=1`, `perf/ipc-bench.ts`) | in-app bench | invoke < 1 ms, 170 KB payload 5 ms, 15 parallel 3 ms: no change needed |
| 22 | Long lists (Today, Inbox/labels/filters, Upcoming) render the first 30 rows on mount and the rest the next frame (`useRowBudget`; `VITE_PROGRESSIVE_ROWS=0` turns it off for A/B) | A/B builds, 3 rounds | 4× CPU, first rows: Inbox 192 → 144, Upcoming 192 → 163, Today 119 → 104 ms; full list ~15 ms later |
| 23 | Brotli-11 copies of hashed web assets at build time (`vite.config.ts` precompress, web builds only), served by the API when the client takes br (`apps/api/src/client-files.ts`); Cloudflare keeps origin brotli. Production today: Cloudflare compresses on the fly, the main chunk arrives as 849 KB gzip / 821 KB br | sizes of this build; Bun end-to-end check; unit test | main chunk over the wire 471 KB (gzip -9) → 380 KB (−19%); all JS/CSS 2.64 MB → 576 KB; build +~1.5 s |
| 24 | The vendored UI library (`src/ui`, imported through its barrel) marked side-effect-free for Rolldown (`vite.config.ts`), so unused components (combobox, accordion, menubar, …) drop out | `step24-ui-treeshake` (all scenarios run), A/B `ab-treeshake-off` vs `ab-treeshake-on` | startup JS 471 → 450 KB gzip (380 → 373 KB br); cold FCP 140 → 108 ms; warm reload 148 → 133 ms; tabs unchanged |
| 25 | Native apps open the API connection at launch (a HEAD on the shared reqwest client in `lib.rs` setup), while the webview boots | TCP + TLS to the API through Cloudflare from Zurich: TCP 15 ms, TLS done 35 ms (p50 of 6) | the first native read after launch skips ~35 ms of connection setup; not timed inside the app |
| (13) | React Compiler, tried and reverted (see `PLAN.md`) | `step13-compiler`, `step13-cpu4` | +93 KB gz, mixed results |

## Co-location, measured (database in Frankfurt instead of Oregon)

`results/eu-colocated.md`: same build and harness against a `perf` branch of the new
`todalo-eu` project (aws-eu-central-1), 17 ms from this machine. Cold load 440 → 139 ms,
warm reload 118 → 67 ms, other-device sync 430 → 66 ms, server-confirmed quick add 229 → 47 ms,
API reads ~200 → 16–23 ms, writes ~200–400 → 22–39 ms. Details and steps: `COLOCATION.md`.

## Measured and left out (2026-11-24)

| idea | measurement | why not |
|---|---|---|
| Completion in one database round trip (guarded UPDATE beside the read) | Frankfurt (`eu-colocated`): check-off on screen 33 ms, server answer 37.5 ms, other-device sync 66 ms; one round trip ≈ 17 ms | The check-off doesn't wait on the server, so the saving is invisible; sync 66 → ~49 ms stays under ~100 ms. It would also duplicate the milestone-criteria rule in SQL that the test database can't run. |
| Font preload | Default load requests 0 fonts (the UI uses the system font stack); custom fonts from Appearance come from the service worker's asset cache after their first load | A preload would download a font nobody sees. |
| Brotli copies for the Mac/iOS apps | Tauri embeds and compresses the frontend in the binary (`tauri-codegen`) and serves it locally over a custom protocol | Nothing is downloaded, so there is nothing to compress. |
| Edge-caching the page (Cloudflare) | Production TTFB, 12 samples: page (origin) 115 ms p50, edge-cached asset 101 ms p50 | ~14 ms, first visit only (repeat visits come from the service worker), with a stale-page risk after deploys. |

## Not done here (needs a decision)

- ~~**Co-locate the database and API**~~: done on 2026-11-24, see `COLOCATION.md`.
