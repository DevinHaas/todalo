# Perf run: step12-early

2026-11-24T07:24:25.227Z · git 152dd40+wip · runs 3 · CPU ×1 · 400 tasks

## Scenarios (ms, input → first frame after the change; loads from navigation start)

| scenario | p50 | p95 | base p50 | Δ | INP | TBT | extra |
|---|---|---|---|---|---|---|---|
| load:cold | 826 | 845 | 875 | -6% | – | 0.0 | fcp 124, lcp 124, ttfb 1.2, jsKB 478, apiCount 10.0, domNodes 3719 |
| load:warm | 120 | 125 | 121 | -1% | – | 6.0 | fcp 0.0, lcp 0.0, ttfb 1.3, jsKB 2.0, apiCount 0.0, domNodes 3759 |

Cold load API waterfall (start→end ms): /api/v1/today 18→618, /api/v1/account 95→496

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
