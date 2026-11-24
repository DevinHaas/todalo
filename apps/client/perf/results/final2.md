# Perf run: final2

2026-11-24T06:59:55.741Z · git 152dd40+wip · runs 5 · CPU ×1 · 412 tasks

## Scenarios (ms, input → first frame after the change; loads from navigation start)

| scenario | p50 | p95 | base p50 | Δ | INP | TBT | extra |
|---|---|---|---|---|---|---|---|
| load:cold | 874 | 899 | 871 | 0% | – | 0.0 | fcp 124, lcp 124, ttfb 1.3, jsKB 531, apiCount 7.0, domNodes 3690 |
| load:warm | 121 | 130 | 122 | -1% | – | 9.0 | fcp 0.0, lcp 0.0, ttfb 1.1, jsKB 1.0, apiCount 0.0, domNodes 3733 |
| tab:inbox (first) | 49.2 | 59.0 | 46.2 | 6% | 16.0 | 0.0 |  |
| tab:today (first) | 37.4 | 37.5 | 37.2 | 1% | 0.0 | 0.0 |  |
| tab:upcoming (first) | 73.7 | 178 | 76.7 | -4% | 64.0 | 6.0 |  |
| tab:inbox | 46.5 | 72.4 | 44.2 | 5% | 0.0 | 0.0 |  |
| tab:today | 37.9 | 39.3 | 36.7 | 3% | 0.0 | 0.0 |  |
| tab:upcoming | 57.6 | 66.1 | 64.6 | -11% | 32.0 | 0.0 |  |
| sheet:open | 57.3 | 59.4 | 54.8 | 5% | 0.0 | 0.0 |  |
| sheet:type | 23.4 | 26.3 | 24.1 | -3% | 0.0 | 0.0 |  |
| edit:title | 31.8 | 32.3 | 32.0 | -1% | 0.0 | 0.0 |  |
| complete | 32.8 | 36.0 | 30.9 | 6% | 24.0 | 0.0 | server 401 |
| composer:open | 16.8 | 20.1 | 16.7 | 1% | 0.0 | 0.0 |  |
| composer:type40 | 63.3 | 194 | 47.4 | 34% | 40.0 | 0.0 | perKey 1.6 |
| composer:add | 33.9 | 34.8 | 34.6 | -2% | 0.0 | 0.0 |  |
| scroll:today | 18.2 | 18.4 | 17.9 | 2% | – | – | janky 0.0, max 18.7 |
| quickadd:open | 18.1 | 18.8 | 18.0 | 1% | 0.0 | 0.0 |  |
| quickadd:add | 38.2 | 42.2 | 40.0 | -4% | 24.0 | 0.0 | savedAt 1014 |
| upcoming:cold | 893 | 898 | 896 | -0% | – | – | apiCount 7.0, domNodes 9573 |
| upcoming:warm | 140 | 174 | 140 | -0% | – | – | apiCount 0.0, domNodes 9602 |
| scroll:upcoming | 18.4 | 18.5 | 17.2 | 7% | – | – | janky 1.0, max 30.7 |
| sync:other-device | 421 | 424 | 1217 | -65% | – | – |  |

Cold load API waterfall (start→end ms): /api/v1/today 80→673, /api/v1/account 87→484

## React renders per interaction (React Scan, scan build, worst pass)

| scenario | renders | unnecessary | top components |
|---|---|---|---|
| tab:inbox (first) | 5969 | 0 | anonymous 1218, TaskRow 1065, PendingSubtaskRows 1065, LinkWithRef 430, Inbox 412, TaskRowBody 410 |
| tab:today (first) | 3888 | 0 | TaskRow 980, PendingSubtaskRows 980, anonymous 520, LinkWithRef 256, Inbox 246, X 246 |
| tab:upcoming (first) | 5442 | 0 | anonymous 1156, TaskRow 935, PendingSubtaskRows 935, LinkWithRef 356, X 347, Inbox 346 |
| tab:inbox | 7058 | 0 | TaskRow 1575, PendingSubtaskRows 1575, anonymous 1251, LinkWithRef 421, X 412, Inbox 411 |
| tab:today | 2870 | 0 | anonymous 519, TaskRow 490, PendingSubtaskRows 490, LinkWithRef 256, Inbox 246, X 246 |
| tab:upcoming | 4909 | 0 | anonymous 1151, TaskRow 690, PendingSubtaskRows 690, LinkWithRef 356, Inbox 346, CalendarDays 346 |
| sheet:open | 1843 | 0 | TaskRow 735, PendingSubtaskRows 735, anonymous 56, Property 22, Button 18, Popover 18 |
| sheet:type | 204 | 0 | anonymous 34, Property 16, Popover 12, Button 8, Plus 8, Bar 8 |
| edit:title | 2079 | 0 | TaskRow 735, PendingSubtaskRows 735, anonymous 102, Property 32, Button 30, Popover 25 |
| complete | 1157 | 0 | TaskRow 490, PendingSubtaskRows 490, anonymous 29, LinkWithRef 11, Button 10, NavLinkWithRef 7 |
| composer:open | 39 | 0 | anonymous 10, Popover 5, ContextMenuTrigger 3, MenuRoot 2, FloatingTree 2, Dropdown 2 |
| composer:type40 | 1160 | 0 | anonymous 400, Popover 200, Dropdown 80, Composer 40, Plus 40, Calendar1 40 |
| composer:add | 1268 | 0 | TaskRow 492, PendingSubtaskRows 492, anonymous 69, Popover 21, LinkWithRef 16, Button 10 |
| quickadd:open | 1025 | 0 | TaskRow 411, PendingSubtaskRows 411, anonymous 43, LinkWithRef 13, Popover 11, Button 10 |
| quickadd:add | 1089 | 0 | TaskRow 412, PendingSubtaskRows 412, anonymous 62, Popover 21, LinkWithRef 16, Button 12 |

## API routes (direct to the API: DB queries per request, p50/p95 ms over 10 calls; body KB raw / gzip / brotli; served encoding)

| route | queries | p50 | p95 | KB | gzip | br | served |
|---|---|---|---|---|---|---|---|
| /api/v1/account | 2 | 394 | 394 | 0.2 | 0.2 | 0.2 | none |
| /api/v1/calendar/events | 3 | 198 | 201 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/coach | 5 | 396 | 403 | 0.2 | 0.2 | 0.1 | none |
| /api/v1/coach/chat | 2 | 199 | 201 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/coach/drafts?timeZone=Europe%2FZurich | 1 | 197 | 202 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/goal-links | 2 | 197 | 200 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/goals | 2 | 198 | 200 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/imports/todoist?timeZone=Europe%2FZurich | 1 | 196 | 197 | 0.0 | 0.1 | 0.0 | none |
| /api/v1/metadata | 2 | 199 | 210 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/projects | 1 | 197 | 198 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/rituals?timeZone=Europe%2FZurich | 1 | 200 | 202 | 0.5 | 0.2 | 0.2 | none |
| /api/v1/seasons/current?timeZone=Europe%2FZurich | 1 | 197 | 201 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/seasons/past | 2 | 196 | 197 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/settings | 1 | 197 | 198 | 0.1 | 0.1 | 0.1 | none |
| /api/v1/settings/keyboard | 1 | 196 | 199 | 0.1 | 0.1 | 0.1 | none |
| /api/v1/settings/personalization | 1 | 196 | 198 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/sync | 1 | 196 | 197 | 0.2 | 0.1 | 0.1 | none |
| /api/v1/today | 2 | 204 | 399 | 170 | 15.1 | 11.4 | none |
| POST /api/v1/tasks | 3 | 200 | 204 | – | – | – | undefined |
| PATCH /api/v1/tasks/:id | 6 | 595 | 598 | – | – | – | undefined |
| POST /api/v1/tasks/:id/complete | 5 | 399 | 402 | – | – | – | undefined |
| DELETE /api/v1/tasks/:id | 2 | 397 | 404 | – | – | – | undefined |

## Bundle (prod build)

Initial JS 1742 KB (534 gz) · initial CSS 368 KB (53.2 gz) · all JS 2416 KB in 8 chunks

- bulk-views-BNSES4ZA.js 934KB (279 gz)
- index-DNkiDA7h.js 806KB (253 gz)
- settings-dialog-B-XBuuW7.js 590KB (153 gz)
- index-CcIYMc-f.css 368KB (53 gz)
- dist-BY9j4ReK.js 49KB (16 gz)
- dist-BoHMOFax.js 22KB (8 gz)
