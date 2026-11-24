# Perf run: ab-treeshake-on

2026-11-24T12:35:34.548Z · git 0ae87d8+wip · runs 3 · CPU ×1 · 400 tasks

## Scenarios (ms, input → first frame after the change; loads from navigation start)

| scenario | p50 | p95 | base p50 | Δ | INP | TBT | extra |
|---|---|---|---|---|---|---|---|
| load:cold | 441 | 916 | 439 | 0% | – | 0.0 | fcp 108, lcp 108, ttfb 1.5, jsKB 444, apiCount 2.0, domNodes 3683 |
| load:warm | 133 | 142 | 148 | -10% | – | 10.0 | fcp 0.0, lcp 0.0, ttfb 2.4, jsKB 1.0, apiCount 0.0, domNodes 3712 |
| tab:inbox (first) | 52.2 | 52.2 | 52.5 | -1% | 0.0 | 0.0 |  |
| tab:today (first) | 53.4 | 53.7 | 53.6 | -0% | 32.0 | 0.0 |  |
| tab:upcoming (first) | 53.6 | 53.8 | 53.6 | 0% | 0.0 | 0.0 |  |
| tab:inbox | 49.3 | 49.7 | 49.5 | -0% | 0.0 | 0.0 |  |
| tab:today | 54.0 | 54.5 | 53.6 | 1% | 32.0 | 0.0 |  |
| tab:upcoming | 50.5 | 50.7 | 50.3 | 0% | 0.0 | 0.0 |  |

Cold load API waterfall (start→end ms): /api/v1/today 10→414, /api/v1/account 64→858

## React renders per interaction (React Scan, scan build, worst pass)

| scenario | renders | unnecessary | top components |
|---|---|---|---|
| tab:inbox (first) | 4449 | 0 | anonymous 1174, LinkWithRef 408, Inbox 401, X 401, TaskRowWrapper 400, TaskRowBody 400 |
| tab:today (first) | 2405 | 0 | anonymous 526, LinkWithRef 258, Inbox 251, X 251, TaskRowWrapper 250, TaskRowBody 250 |
| tab:upcoming (first) | 4393 | 0 | anonymous 1206, LinkWithRef 358, Inbox 351, CalendarDays 351, X 351, TaskRowWrapper 350 |
| tab:inbox | 4449 | 0 | anonymous 1174, LinkWithRef 408, Inbox 401, X 401, TaskRowWrapper 400, TaskRowBody 400 |
| tab:today | 2405 | 0 | anonymous 526, LinkWithRef 258, Inbox 251, X 251, TaskRowWrapper 250, TaskRowBody 250 |
| tab:upcoming | 4393 | 0 | anonymous 1206, LinkWithRef 358, Inbox 351, CalendarDays 351, X 351, TaskRowWrapper 350 |

## API routes (direct to the API: DB queries per request, p50/p95 ms over 10 calls; body KB raw / gzip / brotli; served encoding)

| route | queries | p50 | p95 | KB | gzip | br | served |
|---|---|---|---|---|---|---|---|

## Bundle (prod build)

Initial JS 1466 KB (445 gz) · initial CSS 350 KB (49.9 gz) · all JS 2229 KB in 8 chunks

- bulk-views-fKT8j6om.js 796KB (240 gz)
- index-BpBdKsSC.js 668KB (204 gz)
- settings-dialog-DPB3vtk2.js 633KB (167 gz)
- index-U47Oo1VL.css 350KB (50 gz)
- ui-gallery-X8whjIKP.js 59KB (18 gz)
- dist-BY9j4ReK.js 49KB (16 gz)
