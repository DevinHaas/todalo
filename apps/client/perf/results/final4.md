# Perf run: final4

2026-11-24T07:13:17.667Z · git 152dd40+wip · runs 5 · CPU ×1 · 412 tasks

## Scenarios (ms, input → first frame after the change; loads from navigation start)

| scenario | p50 | p95 | base p50 | Δ | INP | TBT | extra |
|---|---|---|---|---|---|---|---|
| load:cold | 875 | 890 | 2774 | -68% | – | 0.0 | fcp 140, lcp 140, ttfb 1.4, jsKB 531, apiCount 10.0, domNodes 3690 |
| load:warm | 121 | 145 | 2441 | -95% | – | 6.0 | fcp 0.0, lcp 0.0, ttfb 1.2, jsKB 1.0, apiCount 0.0, domNodes 3730 |
| tab:inbox (first) | 57.5 | 58.5 | 278 | -79% | 32.0 | 5.0 |  |
| tab:today (first) | 36.8 | 38.6 | 90.5 | -59% | 0.0 | 0.0 |  |
| tab:upcoming (first) | 57.1 | 60.7 | 459 | -88% | 32.0 | 0.0 |  |
| tab:inbox | 48.0 | 63.9 | 170 | -72% | 0.0 | 0.0 |  |
| tab:today | 37.7 | 39.5 | 84.9 | -56% | 0.0 | 0.0 |  |
| tab:upcoming | 53.9 | 55.6 | 337 | -84% | 32.0 | 0.0 |  |
| sheet:open | 55.1 | 56.4 | 114 | -52% | 0.0 | 0.0 |  |
| sheet:type | 24.9 | 28.2 | 46.1 | -46% | 0.0 | 0.0 |  |
| edit:title | 32.3 | 32.7 | 87.6 | -63% | 0.0 | 0.0 |  |
| complete | 30.0 | 34.6 | 113 | -73% | 24.0 | 0.0 | server 629 |
| composer:open | 16.6 | 16.8 | 20.3 | -18% | 0.0 | 0.0 |  |
| composer:type40 | 48.5 | 49.2 | 61.3 | -21% | 32.0 | 0.0 | perKey 1.2 |
| composer:add | 33.5 | 33.6 | 96.3 | -65% | 0.0 | 0.0 |  |
| scroll:today | 17.7 | 18.3 | 18.3 | -3% | – | – | janky 0.0, max 18.5 |
| quickadd:open | 17.2 | 17.5 | 127 | -86% | 0.0 | 0.0 |  |
| quickadd:add | 39.9 | 40.4 | 177 | -77% | 24.0 | 0.0 | savedAt 234 |
| upcoming:cold | 909 | 928 | 2929 | -69% | – | – | apiCount 13.0, domNodes 9562 |
| upcoming:warm | 141 | 147 | 3021 | -95% | – | – | apiCount 0.0, domNodes 9602 |
| scroll:upcoming | 18.4 | 18.4 | 38.9 | -53% | – | – | janky 1.0, max 34.2 |
| sync:other-device | 423 | 427 | 2862 | -85% | – | – |  |

Cold load API waterfall (start→end ms): /api/v1/today 101→714, /api/v1/account 108→514

## React renders per interaction (React Scan, scan build, worst pass)

| scenario | renders | unnecessary | top components |
|---|---|---|---|
| tab:inbox (first) | 5952 | 0 | anonymous 1212, TaskRowWrapper 1065, PendingSubtaskRows 1065, LinkWithRef 423, X 412, Inbox 411 |
| tab:today (first) | 2870 | 0 | anonymous 519, TaskRowWrapper 490, PendingSubtaskRows 490, LinkWithRef 256, Inbox 246, X 246 |
| tab:upcoming (first) | 5777 | 0 | anonymous 1204, TaskRowWrapper 1035, PendingSubtaskRows 1035, LinkWithRef 356, X 348, Inbox 346 |
| tab:inbox | 5379 | 0 | anonymous 1202, TaskRowWrapper 820, PendingSubtaskRows 820, LinkWithRef 421, Inbox 411, X 411 |
| tab:today | 2870 | 0 | anonymous 519, TaskRowWrapper 490, PendingSubtaskRows 490, LinkWithRef 256, Inbox 246, X 246 |
| tab:upcoming | 4909 | 0 | anonymous 1151, TaskRowWrapper 690, PendingSubtaskRows 690, LinkWithRef 356, Inbox 346, CalendarDays 346 |
| sheet:open | 864 | 0 | TaskRowWrapper 245, PendingSubtaskRows 245, anonymous 55, Property 24, Button 20, Popover 18 |
| sheet:type | 204 | 0 | anonymous 34, Property 16, Popover 12, Button 8, Plus 8, Bar 8 |
| edit:title | 484 | 0 | anonymous 81, Property 24, Button 22, Popover 19, Plus 17, LinkWithRef 15 |
| complete | 177 | 0 | anonymous 29, LinkWithRef 11, Button 10, NavLinkWithRef 7, Plus 6, ContextMenuTrigger 4 |
| composer:open | 39 | 0 | anonymous 10, Popover 5, ContextMenuTrigger 3, MenuRoot 2, FloatingTree 2, Dropdown 2 |
| composer:type40 | 1160 | 0 | anonymous 400, Popover 200, Dropdown 80, Composer 40, Plus 40, Calendar1 40 |
| composer:add | 285 | 0 | anonymous 69, Popover 21, LinkWithRef 16, Button 10, Plus 8, Dropdown 8 |
| quickadd:open | 203 | 0 | anonymous 43, LinkWithRef 13, Popover 11, Button 10, NavLinkWithRef 7, Plus 6 |
| quickadd:add | 267 | 0 | anonymous 62, Popover 21, LinkWithRef 16, Button 12, Plus 8, Dropdown 8 |

## API routes (direct to the API: DB queries per request, p50/p95 ms over 10 calls; body KB raw / gzip / brotli; served encoding)

| route | queries | p50 | p95 | KB | gzip | br | served |
|---|---|---|---|---|---|---|---|
| /api/v1/account | 1 | 201 | 202 | 0.2 | 0.2 | 0.2 | none |
| /api/v1/calendar/events | 4 | 200 | 202 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/coach | 5 | 405 | 408 | 0.2 | 0.2 | 0.1 | none |
| /api/v1/coach/chat | 2 | 201 | 204 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/coach/drafts?timeZone=Europe%2FZurich | 1 | 199 | 201 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/goal-links | 2 | 200 | 206 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/goals | 2 | 200 | 202 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/imports/todoist?timeZone=Europe%2FZurich | 3 | 199 | 199 | 0.0 | 0.1 | 0.0 | none |
| /api/v1/metadata | 2 | 200 | 203 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/projects | 1 | 199 | 200 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/rituals?timeZone=Europe%2FZurich | 1 | 202 | 205 | 0.5 | 0.2 | 0.2 | none |
| /api/v1/seasons/current?timeZone=Europe%2FZurich | 1 | 199 | 201 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/seasons/past | 1 | 199 | 199 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/settings | 1 | 198 | 201 | 0.1 | 0.1 | 0.1 | none |
| /api/v1/settings/keyboard | 1 | 199 | 200 | 0.1 | 0.1 | 0.1 | none |
| /api/v1/settings/personalization | 1 | 199 | 199 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/sync | 1 | 199 | 200 | 0.2 | 0.1 | 0.1 | none |
| /api/v1/today | 4 | 208 | 797 | 170 | 15.1 | 11.4 | none |
| POST /api/v1/tasks | 4 | 208 | 215 | – | – | – | undefined |
| PATCH /api/v1/tasks/:id | 6 | 402 | 404 | – | – | – | undefined |
| POST /api/v1/tasks/:id/complete | 5 | 408 | 412 | – | – | – | undefined |
| DELETE /api/v1/tasks/:id | 1 | 205 | 211 | – | – | – | undefined |

## Bundle (prod build)

Initial JS 1743 KB (534 gz) · initial CSS 368 KB (53.2 gz) · all JS 2418 KB in 8 chunks

- bulk-views-rf7P_hSs.js 935KB (280 gz)
- index-BrzMTmhE.js 806KB (254 gz)
- settings-dialog-DEzojiuJ.js 590KB (153 gz)
- index-CcIYMc-f.css 368KB (53 gz)
- dist-BY9j4ReK.js 49KB (16 gz)
- dist-BoHMOFax.js 22KB (8 gz)
