# Perf run: eu-colocated-parts1

2026-11-24T11:32:25.523Z · git 152dd40+wip · runs 5 · CPU ×1 · 400 tasks

## Scenarios (ms, input → first frame after the change; loads from navigation start)

| scenario | p50 | p95 | base p50 | Δ | INP | TBT | extra |
|---|---|---|---|---|---|---|---|
| load:cold | 137 | 187 | 139 | -2% | – | 0.0 | fcp 0.0, lcp 0.0, ttfb 1.3, jsKB 478, apiCount 2.0, domNodes 3702 |
| load:warm | 73.6 | 75.3 | 67.4 | 9% | – | 0.0 | fcp 0.0, lcp 0.0, ttfb 2.4, jsKB 1.0, apiCount 0.0, domNodes 3699 |
| sync:other-device | 59.0 | 72.9 | 65.8 | -10% | – | – |  |

Cold load API waterfall (start→end ms): /api/v1/today 21→59, /api/v1/account 91→131

## React renders per interaction (React Scan, scan build, worst pass)

| scenario | renders | unnecessary | top components |
|---|---|---|---|

## API routes (direct to the API: DB queries per request, p50/p95 ms over 10 calls; body KB raw / gzip / brotli; served encoding)

| route | queries | p50 | p95 | KB | gzip | br | served |
|---|---|---|---|---|---|---|---|
| /api/v1/account | 1 | 18.0 | 19.0 | 0.2 | 0.2 | 0.2 | none |
| /api/v1/calendar/events | 3 | 19.1 | 20.5 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/coach | 5 | 36.5 | 39.7 | 0.1 | 0.1 | 0.1 | none |
| /api/v1/goal-links | 2 | 19.0 | 20.4 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/goals | 2 | 19.6 | 21.0 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/imports/todoist?timeZone=Europe%2FZurich | 1 | 16.1 | 18.5 | 0.0 | 0.1 | 0.0 | none |
| /api/v1/metadata | 2 | 20.2 | 21.1 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/projects | 1 | 16.8 | 18.9 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/rituals?timeZone=Europe%2FZurich | 5 | 82.5 | 85.4 | 0.5 | 0.2 | 0.2 | none |
| /api/v1/seasons/current?timeZone=Europe%2FZurich | 1 | 17.2 | 18.0 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/seasons/past | 1 | 16.5 | 19.6 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/settings | 1 | 16.6 | 18.6 | 0.1 | 0.1 | 0.1 | none |
| /api/v1/settings/keyboard | 1 | 17.8 | 19.6 | 0.1 | 0.1 | 0.1 | none |
| /api/v1/settings/personalization | 1 | 16.2 | 18.6 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/sync | 1 | 16.8 | 17.9 | 0.2 | 0.1 | 0.1 | none |
| /api/v1/today | 2 | 23.2 | 24.1 | 165 | 13.6 | 10.2 | none |
| POST /api/v1/tasks | 3 | 22.6 | 23.6 | – | – | – | undefined |
| PATCH /api/v1/tasks/:id | 6 | 38.6 | 43.8 | – | – | – | undefined |
| POST /api/v1/tasks/:id/complete | 5 | 42.8 | 43.0 | – | – | – | undefined |
| DELETE /api/v1/tasks/:id | 1 | 25.8 | 38.9 | – | – | – | undefined |

## Bundle (prod build)

Initial JS 1584 KB (480 gz) · initial CSS 368 KB (53.2 gz) · all JS 2259 KB in 8 chunks

- bulk-views-CtK_fgiG.js 936KB (280 gz)
- index-CEfuv9gZ.js 647KB (199 gz)
- settings-dialog-DSO3VoDy.js 590KB (153 gz)
- index-DuETLK_o.css 368KB (53 gz)
- dist-BY9j4ReK.js 49KB (16 gz)
- dist-BoHMOFax.js 22KB (8 gz)
