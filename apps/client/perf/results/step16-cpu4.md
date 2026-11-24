# Perf run: step16-cpu4

2026-11-24T07:45:03.019Z · git 152dd40+wip · runs 3 · CPU ×4 · 400 tasks

## Scenarios (ms, input → first frame after the change; loads from navigation start)

| scenario | p50 | p95 | base p50 | Δ | INP | TBT | extra |
|---|---|---|---|---|---|---|---|
| tab:inbox (first) | 178 | 181 | 620 | -71% | 24.0 | 0.0 |  |
| tab:today (first) | 114 | 115 | 110 | 4% | 24.0 | 0.0 |  |
| tab:upcoming (first) | 265 | 270 | 257 | 3% | 32.0 | 58.0 |  |
| tab:inbox | 226 | 231 | 173 | 31% | 32.0 | 29.0 |  |
| tab:today | 106 | 140 | 108 | -2% | 32.0 | 0.0 |  |
| tab:upcoming | 165 | 265 | 172 | -4% | 32.0 | 0.0 |  |

## React renders per interaction (React Scan, scan build, worst pass)

| scenario | renders | unnecessary | top components |
|---|---|---|---|
| tab:inbox (first) | 4459 | 0 | anonymous 1177, LinkWithRef 411, Inbox 401, X 401, TaskRowWrapper 400, TaskRowBody 400 |
| tab:today (first) | 2425 | 0 | anonymous 529, LinkWithRef 261, Inbox 251, X 251, TaskRowWrapper 250, TaskRowBody 250 |
| tab:upcoming (first) | 4288 | 0 | anonymous 1168, LinkWithRef 361, X 352, Inbox 351, CalendarDays 351, TaskRowWrapper 350 |
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
