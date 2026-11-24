# Perf run: step6-quick

2026-11-24T06:29:10.013Z · git 152dd40+wip · runs 2 · CPU ×1 · 400 tasks

## Scenarios (ms, input → first frame after the change; loads from navigation start)

| scenario | p50 | p95 | base p50 | Δ | INP | TBT | extra |
|---|---|---|---|---|---|---|---|
| load:cold | 1897 | 1897 | 1882 | 1% | – | 16.0 | fcp 140, lcp 140, ttfb 1.9, jsKB 530, apiCount 19.0, domNodes 3758 |
| load:warm | 157 | 157 | 1102 | -86% | – | 22.0 | fcp 0.0, lcp 0.0, ttfb 1.3, jsKB 1.0, apiCount 0.0, domNodes 3758 |
| upcoming:cold | 1947 | 1947 | 1985 | -2% | – | – | apiCount 19.0, domNodes 9654 |
| upcoming:warm | 264 | 264 | 1131 | -77% | – | – | apiCount 0.0, domNodes 9654 |
| scroll:upcoming | 18.6 | 18.6 | 29.3 | -37% | – | – | janky 1.0, max 30.1 |

Cold load API waterfall (start→end ms): /api/v1/account 75→865, /api/v1/settings/keyboard 897→1100, /api/v1/rituals 897→1109, /api/v1/goals 897→1491, /api/v1/metadata 898→1509, /api/v1/projects 898→1510, /api/v1/coach 898→1711, /api/v1/today 898→1695, /api/v1/calendar/events 899→1705, /api/v1/settings/personalization 900→1696, /api/v1/imports/todoist 901→1713, /api/v1/settings 901→1708

## React renders per interaction (React Scan, scan build, worst pass)

| scenario | renders | unnecessary | top components |
|---|---|---|---|

## API routes (direct to the API: DB queries per request, p50/p95 ms over 10 calls; body KB raw / gzip / brotli; served encoding)

| route | queries | p50 | p95 | KB | gzip | br | served |
|---|---|---|---|---|---|---|---|
| /api/v1/account | 4 | 796 | 802 | 0.2 | 0.2 | 0.2 | none |
| /api/v1/calendar/events | 4 | 197 | 202 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/coach | 6 | 397 | 411 | 0.2 | 0.2 | 0.1 | none |
| /api/v1/coach/chat | 2 | 199 | 200 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/coach/drafts?timeZone=Europe%2FZurich | 1 | 197 | 199 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/goal-links | 2 | 199 | 200 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/goals | 2 | 199 | 204 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/imports/todoist?timeZone=Europe%2FZurich | 1 | 196 | 197 | 0.0 | 0.1 | 0.0 | none |
| /api/v1/metadata | 2 | 199 | 201 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/projects | 1 | 196 | 198 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/rituals?timeZone=Europe%2FZurich | 3 | 199 | 201 | 0.5 | 0.2 | 0.2 | none |
| /api/v1/seasons/current?timeZone=Europe%2FZurich | 1 | 197 | 198 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/seasons/past | 1 | 196 | 197 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/settings | 2 | 196 | 197 | 0.1 | 0.1 | 0.1 | none |
| /api/v1/settings/keyboard | 1 | 196 | 198 | 0.1 | 0.1 | 0.1 | none |
| /api/v1/settings/personalization | 1 | 198 | 199 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/sync | 1 | 198 | 200 | 0.2 | 0.1 | 0.1 | none |
| /api/v1/today | 2 | 203 | 399 | 165 | 14.5 | 10.8 | none |
| POST /api/v1/tasks | 5 | 409 | 412 | – | – | – | undefined |
| PATCH /api/v1/tasks/:id | 6 | 600 | 607 | – | – | – | undefined |
| POST /api/v1/tasks/:id/complete | 5 | 604 | 607 | – | – | – | undefined |
| DELETE /api/v1/tasks/:id | 4 | 408 | 798 | – | – | – | undefined |

## Bundle (prod build)

Initial JS 1741 KB (533 gz) · initial CSS 368 KB (53.2 gz) · all JS 2415 KB in 8 chunks

- bulk-views-AdL_GQq1.js 933KB (279 gz)
- index-BrxR7THQ.js 805KB (253 gz)
- settings-dialog-U7x39Nw-.js 590KB (153 gz)
- index-D6GBG_Ky.css 368KB (53 gz)
- dist-BY9j4ReK.js 49KB (16 gz)
- dist-BoHMOFax.js 22KB (8 gz)
