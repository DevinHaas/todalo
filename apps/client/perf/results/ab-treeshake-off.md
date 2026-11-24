# Perf run: ab-treeshake-off

2026-11-24T12:34:41.617Z · git 0ae87d8+wip · runs 3 · CPU ×1 · 400 tasks

## Scenarios (ms, input → first frame after the change; loads from navigation start)

| scenario | p50 | p95 | INP | TBT | extra |
|---|---|---|---|---|---|
| load:cold | 439 | 992 | – | 0.0 | fcp 140, lcp 140, ttfb 1.6, jsKB 464, apiCount 2.0, domNodes 3680 |
| load:warm | 148 | 173 | – | 14.0 | fcp 132, lcp 132, ttfb 2.6, jsKB 1.0, apiCount 0.0, domNodes 3709 |
| tab:inbox (first) | 52.5 | 54.4 | 0.0 | 0.0 |  |
| tab:today (first) | 53.6 | 54.1 | 32.0 | 0.0 |  |
| tab:upcoming (first) | 53.6 | 53.8 | 0.0 | 0.0 |  |
| tab:inbox | 49.5 | 50.1 | 0.0 | 0.0 |  |
| tab:today | 53.6 | 53.7 | 32.0 | 0.0 |  |
| tab:upcoming | 50.3 | 50.5 | 0.0 | 0.0 |  |

Cold load API waterfall (start→end ms): /api/v1/today 25→438, /api/v1/account 121→925

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

Initial JS 1553 KB (466 gz) · initial CSS 350 KB (49.9 gz) · all JS 2228 KB in 5 chunks

- index-D5odES8c.js 1553KB (466 gz)
- settings-dialog-B3ROWxzi.js 590KB (153 gz)
- index-U47Oo1VL.css 350KB (50 gz)
- dist-DfwWHJbG.js 49KB (16 gz)
- dist-BoHMOFax.js 22KB (8 gz)
- ui-gallery-CMIoONJM.js 14KB (4 gz)
