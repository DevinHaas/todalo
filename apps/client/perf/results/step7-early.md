# Perf run: step7-early

2026-11-24T06:38:37.201Z · git 152dd40+wip · runs 3 · CPU ×1 · 400 tasks

## Scenarios (ms, input → first frame after the change; loads from navigation start)

| scenario | p50 | p95 | base p50 | Δ | INP | TBT | extra |
|---|---|---|---|---|---|---|---|
| load:cold | 875 | 889 | 1897 | -54% | – | 0.0 | fcp 124, lcp 124, ttfb 1.1, jsKB 531, apiCount 2.0, domNodes 3729 |
| load:warm | 122 | 163 | 157 | -22% | – | 7.0 | fcp 0.0, lcp 0.0, ttfb 1.1, jsKB 1.0, apiCount 0.0, domNodes 3758 |

Cold load API waterfall (start→end ms): /api/v1/today 80→679, /api/v1/account 87→682

## React renders per interaction (React Scan, scan build, worst pass)

| scenario | renders | unnecessary | top components |
|---|---|---|---|

## API routes (direct to the API: DB queries per request, p50/p95 ms over 10 calls; body KB raw / gzip / brotli; served encoding)

| route | queries | p50 | p95 | KB | gzip | br | served |
|---|---|---|---|---|---|---|---|

## Bundle (prod build)

Initial JS 1741 KB (534 gz) · initial CSS 368 KB (53.2 gz) · all JS 2416 KB in 8 chunks

- bulk-views-RPeh7F_m.js 934KB (279 gz)
- index-DMm836rR.js 806KB (253 gz)
- settings-dialog-DwaBzezP.js 590KB (153 gz)
- index-CcIYMc-f.css 368KB (53 gz)
- dist-BY9j4ReK.js 49KB (16 gz)
- dist-BoHMOFax.js 22KB (8 gz)
