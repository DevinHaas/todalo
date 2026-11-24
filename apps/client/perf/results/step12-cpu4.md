# Perf run: step12-cpu4

2026-11-24T07:24:55.430Z · git 152dd40+wip · runs 3 · CPU ×4 · 400 tasks

## Scenarios (ms, input → first frame after the change; loads from navigation start)

| scenario | p50 | p95 | base p50 | Δ | INP | TBT | extra |
|---|---|---|---|---|---|---|---|
| load:cold | 888 | 901 | 1072 | -17% | – | 152 | fcp 248, lcp 248, ttfb 1.2, jsKB 478, apiCount 7.0, domNodes 3719 |
| load:warm | 312 | 319 | 311 | 0% | – | 101 | fcp 292, lcp 0.0, ttfb 1.0, jsKB 2.0, apiCount 0.0, domNodes 3759 |

Cold load API waterfall (start→end ms): /api/v1/today 22→618, /api/v1/account 210→615

## React renders per interaction (React Scan, scan build, worst pass)

| scenario | renders | unnecessary | top components |
|---|---|---|---|

## API routes (direct to the API: DB queries per request, p50/p95 ms over 10 calls; body KB raw / gzip / brotli; served encoding)

| route | queries | p50 | p95 | KB | gzip | br | served |
|---|---|---|---|---|---|---|---|

## Bundle (prod build)

Initial JS 1583 KB (479 gz) · initial CSS 368 KB (53.2 gz) · all JS 2258 KB in 8 chunks

- bulk-views-D9Z-JPmE.js 935KB (280 gz)
- index-7yfQtKa-.js 646KB (199 gz)
- settings-dialog-C8kk4dNs.js 590KB (153 gz)
- index-CcIYMc-f.css 368KB (53 gz)
- dist-BY9j4ReK.js 49KB (16 gz)
- dist-BoHMOFax.js 22KB (8 gz)
