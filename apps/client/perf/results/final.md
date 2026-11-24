# Perf run: final

2026-11-24T06:44:05.413Z · git 152dd40+wip · runs 5 · CPU ×1 · 412 tasks

## Scenarios (ms, input → first frame after the change; loads from navigation start)

| scenario | p50 | p95 | base p50 | Δ | INP | TBT | extra |
|---|---|---|---|---|---|---|---|
| load:cold | 871 | 878 | 2774 | -69% | – | 0.0 | fcp 124, lcp 124, ttfb 1.3, jsKB 531, apiCount 2.0, domNodes 3701 |
| load:warm | 122 | 134 | 2441 | -95% | – | 9.0 | fcp 0.0, lcp 0.0, ttfb 1.0, jsKB 1.0, apiCount 0.0, domNodes 3730 |
| tab:inbox (first) | 46.2 | 57.3 | 278 | -83% | 0.0 | 0.0 |  |
| tab:today (first) | 37.2 | 39.9 | 90.5 | -59% | 0.0 | 0.0 |  |
| tab:upcoming (first) | 76.7 | 88.4 | 459 | -83% | 16.0 | 0.0 |  |
| tab:inbox | 44.2 | 118 | 170 | -74% | 0.0 | 0.0 |  |
| tab:today | 36.7 | 37.9 | 84.9 | -57% | 24.0 | 3.0 |  |
| tab:upcoming | 64.6 | 72.4 | 337 | -81% | 32.0 | 0.0 |  |
| sheet:open | 54.8 | 56.6 | 114 | -52% | 0.0 | 0.0 |  |
| sheet:type | 24.1 | 24.8 | 46.1 | -48% | 0.0 | 0.0 |  |
| edit:title | 32.0 | 33.1 | 87.6 | -63% | 0.0 | 0.0 |  |
| complete | 30.9 | 36.6 | 113 | -73% | 24.0 | 0.0 | server 599 |
| composer:open | 16.7 | 17.1 | 20.3 | -18% | 0.0 | 0.0 |  |
| composer:type40 | 47.4 | 80.6 | 61.3 | -23% | 32.0 | 0.0 | perKey 1.2 |
| composer:add | 34.6 | 35.2 | 96.3 | -64% | 0.0 | 0.0 |  |
| scroll:today | 17.9 | 18.2 | 18.3 | -2% | – | – | janky 0.0, max 18.5 |
| quickadd:open | 18.0 | 18.4 | 127 | -86% | 0.0 | 0.0 |  |
| quickadd:add | 40.0 | 40.3 | 177 | -77% | 24.0 | 0.0 | savedAt 1217 |
| upcoming:cold | 896 | 913 | 2929 | -69% | – | – | apiCount 6.0, domNodes 9573 |
| upcoming:warm | 140 | 147 | 3021 | -95% | – | – | apiCount 0.0, domNodes 9602 |
| scroll:upcoming | 17.2 | 18.4 | 38.9 | -56% | – | – | janky 2.0, max 35.2 |
| sync:other-device | 1217 | 1229 | 2862 | -57% | – | – |  |

Cold load API waterfall (start→end ms): /api/v1/today 82→679, /api/v1/account 89→686

## React renders per interaction (React Scan, scan build, worst pass)

| scenario | renders | unnecessary | top components |
|---|---|---|---|
| tab:inbox (first) | 7493 | 0 | TaskRow 1800, PendingSubtaskRows 1800, anonymous 1223, LinkWithRef 432, Inbox 412, TaskRowBody 410 |
| tab:today (first) | 3967 | 0 | TaskRow 980, PendingSubtaskRows 980, anonymous 538, LinkWithRef 265, Inbox 247, TaskRowBody 245 |
| tab:upcoming (first) | 4879 | 0 | anonymous 1145, TaskRow 690, PendingSubtaskRows 690, LinkWithRef 355, Inbox 346, CalendarDays 346 |
| tab:inbox | 7914 | 0 | TaskRow 1920, PendingSubtaskRows 1920, anonymous 1298, LinkWithRef 422, X 412, Inbox 411 |
| tab:today | 2870 | 0 | anonymous 519, TaskRow 490, PendingSubtaskRows 490, LinkWithRef 256, Inbox 246, X 246 |
| tab:upcoming | 4910 | 0 | anonymous 1151, TaskRow 690, PendingSubtaskRows 690, LinkWithRef 356, Inbox 346, CalendarDays 346 |
| sheet:open | 1769 | 0 | TaskRow 735, PendingSubtaskRows 735, anonymous 41, Button 18, Property 16, Popover 12 |
| sheet:type | 204 | 0 | anonymous 34, Property 16, Popover 12, Button 8, Plus 8, Bar 8 |
| edit:title | 2079 | 0 | TaskRow 735, PendingSubtaskRows 735, anonymous 102, Property 32, Button 30, Popover 25 |
| complete | 1153 | 0 | TaskRow 488, PendingSubtaskRows 488, anonymous 29, LinkWithRef 11, Button 10, NavLinkWithRef 7 |
| composer:open | 39 | 0 | anonymous 10, Popover 5, ContextMenuTrigger 3, MenuRoot 2, FloatingTree 2, Dropdown 2 |
| composer:type40 | 1160 | 0 | anonymous 400, Popover 200, Dropdown 80, Composer 40, Plus 40, Calendar1 40 |
| composer:add | 1264 | 0 | TaskRow 490, PendingSubtaskRows 490, anonymous 69, Popover 21, LinkWithRef 16, Button 10 |
| quickadd:open | 1025 | 0 | TaskRow 411, PendingSubtaskRows 411, anonymous 43, LinkWithRef 13, Popover 11, Button 10 |
| quickadd:add | 1089 | 0 | TaskRow 412, PendingSubtaskRows 412, anonymous 62, Popover 21, LinkWithRef 16, Button 12 |

## API routes (direct to the API: DB queries per request, p50/p95 ms over 10 calls; body KB raw / gzip / brotli; served encoding)

| route | queries | p50 | p95 | KB | gzip | br | served |
|---|---|---|---|---|---|---|---|
| /api/v1/account | 3 | 598 | 603 | 0.2 | 0.2 | 0.2 | none |
| /api/v1/calendar/events | 4 | 201 | 202 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/coach | 5 | 404 | 407 | 0.2 | 0.2 | 0.1 | none |
| /api/v1/coach/chat | 2 | 200 | 201 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/coach/drafts?timeZone=Europe%2FZurich | 1 | 200 | 201 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/goal-links | 2 | 199 | 201 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/goals | 2 | 200 | 201 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/imports/todoist?timeZone=Europe%2FZurich | 1 | 198 | 199 | 0.0 | 0.1 | 0.0 | none |
| /api/v1/metadata | 3 | 200 | 203 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/projects | 1 | 198 | 200 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/rituals?timeZone=Europe%2FZurich | 3 | 202 | 205 | 0.5 | 0.2 | 0.2 | none |
| /api/v1/seasons/current?timeZone=Europe%2FZurich | 1 | 198 | 200 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/seasons/past | 1 | 198 | 201 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/settings | 1 | 198 | 202 | 0.1 | 0.1 | 0.1 | none |
| /api/v1/settings/keyboard | 1 | 198 | 200 | 0.1 | 0.1 | 0.1 | none |
| /api/v1/settings/personalization | 1 | 198 | 199 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/sync | 1 | 198 | 199 | 0.2 | 0.1 | 0.1 | none |
| /api/v1/today | 2 | 206 | 404 | 170 | 15.1 | 11.4 | none |
| POST /api/v1/tasks | 7 | 410 | 416 | – | – | – | undefined |
| PATCH /api/v1/tasks/:id | 6 | 605 | 614 | – | – | – | undefined |
| POST /api/v1/tasks/:id/complete | 5 | 611 | 614 | – | – | – | undefined |
| DELETE /api/v1/tasks/:id | 4 | 400 | 797 | – | – | – | undefined |

## Bundle (prod build)

Initial JS 1741 KB (534 gz) · initial CSS 368 KB (53.2 gz) · all JS 2416 KB in 8 chunks

- bulk-views-RPeh7F_m.js 934KB (279 gz)
- index-CDDx1D5f.js 806KB (253 gz)
- settings-dialog-DFAUs8nn.js 590KB (153 gz)
- index-CcIYMc-f.css 368KB (53 gz)
- dist-BY9j4ReK.js 49KB (16 gz)
- dist-BoHMOFax.js 22KB (8 gz)
