# Perf run: step16-collapse

2026-11-24T07:44:37.099Z · git 152dd40+wip · runs 3 · CPU ×1 · 400 tasks

## Scenarios (ms, input → first frame after the change; loads from navigation start)

| scenario | p50 | p95 | base p50 | Δ | INP | TBT | extra |
|---|---|---|---|---|---|---|---|
| tab:inbox (first) | 57.5 | 57.8 | 58.0 | -1% | 32.0 | 0.0 |  |
| tab:today (first) | 34.6 | 36.7 | 37.7 | -8% | 0.0 | 0.0 |  |
| tab:upcoming (first) | 58.0 | 59.0 | 57.3 | 1% | 32.0 | 0.0 |  |
| tab:inbox | 57.1 | 57.1 | 56.6 | 1% | 32.0 | 0.0 |  |
| tab:today | 37.7 | 38.0 | 37.3 | 1% | 0.0 | 0.0 |  |
| tab:upcoming | 54.5 | 54.9 | 54.6 | -0% | 32.0 | 0.0 |  |

## React renders per interaction (React Scan, scan build, worst pass)

| scenario | renders | unnecessary | top components |
|---|---|---|---|
| tab:inbox (first) | 4459 | 0 | anonymous 1177, LinkWithRef 411, Inbox 401, X 401, TaskRowWrapper 400, TaskRowBody 400 |
| tab:today (first) | 2425 | 0 | anonymous 529, LinkWithRef 261, Inbox 251, X 251, TaskRowWrapper 250, TaskRowBody 250 |
| tab:upcoming (first) | 4274 | 0 | anonymous 1166, LinkWithRef 361, Inbox 351, CalendarDays 351, X 351, TaskRowWrapper 350 |
| tab:inbox | 4459 | 0 | anonymous 1177, LinkWithRef 411, Inbox 401, X 401, TaskRowWrapper 400, TaskRowBody 400 |
| tab:today | 2425 | 0 | anonymous 529, LinkWithRef 261, Inbox 251, X 251, TaskRowWrapper 250, TaskRowBody 250 |
| tab:upcoming | 4274 | 0 | anonymous 1166, LinkWithRef 361, Inbox 351, CalendarDays 351, X 351, TaskRowWrapper 350 |

## API routes (direct to the API: DB queries per request, p50/p95 ms over 10 calls; body KB raw / gzip / brotli; served encoding)

| route | queries | p50 | p95 | KB | gzip | br | served |
|---|---|---|---|---|---|---|---|

## Bundle (prod build)

Initial JS 1583 KB (480 gz) · initial CSS 368 KB (53.2 gz) · all JS 2258 KB in 8 chunks

- bulk-views-D6bgkfQd.js 935KB (280 gz)
- index-BSebhky5.js 646KB (199 gz)
- settings-dialog-BkVK7PPE.js 590KB (153 gz)
- index-CcIYMc-f.css 368KB (53 gz)
- dist-BY9j4ReK.js 49KB (16 gz)
- dist-BoHMOFax.js 22KB (8 gz)
