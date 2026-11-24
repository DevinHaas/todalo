# Perf run: step8-sync

2026-11-24T06:52:26.334Z · git 152dd40+wip · runs 5 · CPU ×1 · 400 tasks

## Scenarios (ms, input → first frame after the change; loads from navigation start)

| scenario | p50 | p95 | base p50 | Δ | INP | TBT | extra |
|---|---|---|---|---|---|---|---|
| sync:other-device | 630 | 642 | 1217 | -48% | – | – |  |

## React renders per interaction (React Scan, scan build, worst pass)

| scenario | renders | unnecessary | top components |
|---|---|---|---|

## API routes (direct to the API: DB queries per request, p50/p95 ms over 10 calls; body KB raw / gzip / brotli; served encoding)

| route | queries | p50 | p95 | KB | gzip | br | served |
|---|---|---|---|---|---|---|---|

## Bundle (prod build)

Initial JS 1742 KB (534 gz) · initial CSS 368 KB (53.2 gz) · all JS 2416 KB in 8 chunks

- bulk-views-BNSES4ZA.js 934KB (279 gz)
- index-71fttpVv.js 806KB (253 gz)
- settings-dialog-CDStt91t.js 590KB (153 gz)
- index-CcIYMc-f.css 368KB (53 gz)
- dist-BY9j4ReK.js 49KB (16 gz)
- dist-BoHMOFax.js 22KB (8 gz)
