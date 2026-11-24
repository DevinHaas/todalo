# Perf run: step15-tabs

2026-11-24T07:42:16.909Z · git 152dd40+wip · runs 5 · CPU ×1 · 400 tasks

## Scenarios (ms, input → first frame after the change; loads from navigation start)

| scenario | p50 | p95 | base p50 | Δ | INP | TBT | extra |
|---|---|---|---|---|---|---|---|
| tab:inbox (first) | 58.0 | 60.8 | 57.5 | 1% | 32.0 | 0.0 |  |
| tab:today (first) | 37.7 | 38.6 | 36.8 | 2% | 0.0 | 0.0 |  |
| tab:upcoming (first) | 57.3 | 58.8 | 57.1 | 0% | 32.0 | 0.0 |  |
| tab:inbox | 56.6 | 68.0 | 48.0 | 18% | 32.0 | 0.0 |  |
| tab:today | 37.3 | 45.6 | 37.7 | -1% | 0.0 | 0.0 |  |
| tab:upcoming | 54.6 | 55.4 | 53.9 | 1% | 32.0 | 0.0 |  |

## React renders per interaction (React Scan, scan build, worst pass)

| scenario | renders | unnecessary | top components |
|---|---|---|---|
| tab:inbox (first) | 5259 | 0 | anonymous 1177, TaskRowWrapper 800, PendingSubtaskRows 800, LinkWithRef 411, Inbox 401, X 401 |
| tab:today (first) | 2925 | 0 | anonymous 529, TaskRowWrapper 500, PendingSubtaskRows 500, LinkWithRef 261, Inbox 251, X 251 |
| tab:upcoming (first) | 4974 | 0 | anonymous 1166, TaskRowWrapper 700, PendingSubtaskRows 700, LinkWithRef 361, Inbox 351, CalendarDays 351 |
| tab:inbox | 5259 | 0 | anonymous 1177, TaskRowWrapper 800, PendingSubtaskRows 800, LinkWithRef 411, Inbox 401, X 401 |
| tab:today | 2925 | 0 | anonymous 529, TaskRowWrapper 500, PendingSubtaskRows 500, LinkWithRef 261, Inbox 251, X 251 |
| tab:upcoming | 4979 | 0 | anonymous 1168, TaskRowWrapper 700, PendingSubtaskRows 700, LinkWithRef 361, X 352, Inbox 351 |

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
