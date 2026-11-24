# Perf run: final5

2026-11-24T07:38:24.499Z · git 152dd40+wip · runs 5 · CPU ×1 · 412 tasks

## Scenarios (ms, input → first frame after the change; loads from navigation start)

| scenario | p50 | p95 | base p50 | Δ | INP | TBT | extra |
|---|---|---|---|---|---|---|---|
| load:cold | 634 | 649 | 2774 | -77% | – | 0.0 | fcp 124, lcp 124, ttfb 1.2, jsKB 478, apiCount 7.0, domNodes 3691 |
| load:warm | 121 | 124 | 2441 | -95% | – | 6.0 | fcp 0.0, lcp 0.0, ttfb 1.1, jsKB 2.0, apiCount 0.0, domNodes 3731 |
| tab:inbox (first) | 105 | 110 | 278 | -62% | 16.0 | 0.0 |  |
| tab:today (first) | 37.4 | 40.5 | 90.5 | -59% | 0.0 | 0.0 |  |
| tab:upcoming (first) | 124 | 148 | 459 | -73% | 16.0 | 4.0 |  |
| tab:inbox | 56.6 | 72.8 | 170 | -67% | 32.0 | 0.0 |  |
| tab:today | 37.6 | 39.3 | 84.9 | -56% | 0.0 | 0.0 |  |
| tab:upcoming | 56.8 | 62.9 | 337 | -83% | 32.0 | 0.0 |  |
| sheet:open | 53.6 | 56.1 | 114 | -53% | 0.0 | 0.0 |  |
| sheet:type | 24.6 | 26.4 | 46.1 | -47% | 0.0 | 0.0 |  |
| edit:title | 31.5 | 32.3 | 87.6 | -64% | 0.0 | 0.0 |  |
| complete | 30.5 | 34.6 | 113 | -73% | 24.0 | 0.0 | server 631 |
| composer:open | 16.7 | 17.8 | 20.3 | -18% | 0.0 | 0.0 |  |
| composer:type40 | 48.1 | 64.8 | 61.3 | -22% | 32.0 | 0.0 | perKey 1.2 |
| composer:add | 36.3 | 38.2 | 96.3 | -62% | 0.0 | 0.0 |  |
| scroll:today | 18.4 | 18.4 | 18.3 | 1% | – | – | janky 0.0, max 18.7 |
| quickadd:open | 17.5 | 18.4 | 127 | -86% | 0.0 | 0.0 |  |
| quickadd:add | 31.5 | 36.5 | 177 | -82% | 0.0 | 0.0 | savedAt 219 |
| upcoming:cold | 650 | 658 | 2929 | -78% | – | – | apiCount 7.0, domNodes 9563 |
| upcoming:warm | 140 | 155 | 3021 | -95% | – | – | apiCount 0.0, domNodes 9603 |
| scroll:upcoming | 18.3 | 18.5 | 38.9 | -53% | – | – | janky 2.0, max 27.6 |
| sync:other-device | 423 | 433 | 2862 | -85% | – | – |  |

Cold load API waterfall (start→end ms): /api/v1/today 20→606, /api/v1/account 84→484

## React renders per interaction (React Scan, scan build, worst pass)

| scenario | renders | unnecessary | top components |
|---|---|---|---|
| tab:inbox (first) | 5352 | 0 | anonymous 1196, TaskRowWrapper 820, PendingSubtaskRows 820, LinkWithRef 420, Inbox 411, TaskRowBody 410 |
| tab:today (first) | 2841 | 0 | anonymous 513, TaskRowWrapper 490, PendingSubtaskRows 490, LinkWithRef 255, Inbox 246, TaskRowBody 245 |
| tab:upcoming (first) | 5916 | 0 | anonymous 1243, TaskRowWrapper 1035, PendingSubtaskRows 1035, LinkWithRef 357, Inbox 346, CalendarDays 346 |
| tab:inbox | 5389 | 0 | anonymous 1202, TaskRowWrapper 820, PendingSubtaskRows 820, LinkWithRef 421, Inbox 411, X 411 |
| tab:today | 2870 | 0 | anonymous 519, TaskRowWrapper 490, PendingSubtaskRows 490, LinkWithRef 256, Inbox 246, X 246 |
| tab:upcoming | 4909 | 0 | anonymous 1151, TaskRowWrapper 690, PendingSubtaskRows 690, LinkWithRef 356, Inbox 346, CalendarDays 346 |
| sheet:open | 245 | 0 | anonymous 34, Property 16, Button 12, Popover 12, FloatingTree 8, Plus 8 |
| sheet:type | 822 | 0 | TaskRowWrapper 245, PendingSubtaskRows 245, anonymous 55, Property 24, Popover 18, Button 16 |
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
| /api/v1/account | 2 | 200 | 201 | 0.2 | 0.2 | 0.2 | none |
| /api/v1/calendar/events | 4 | 198 | 205 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/coach | 5 | 403 | 403 | 0.2 | 0.2 | 0.1 | none |
| /api/v1/coach/chat | 2 | 200 | 202 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/coach/drafts?timeZone=Europe%2FZurich | 1 | 199 | 204 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/goal-links | 2 | 199 | 201 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/goals | 2 | 199 | 202 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/imports/todoist?timeZone=Europe%2FZurich | 1 | 198 | 199 | 0.0 | 0.1 | 0.0 | none |
| /api/v1/metadata | 2 | 200 | 201 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/projects | 1 | 197 | 199 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/rituals?timeZone=Europe%2FZurich | 3 | 202 | 203 | 0.5 | 0.2 | 0.2 | none |
| /api/v1/seasons/current?timeZone=Europe%2FZurich | 1 | 198 | 199 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/seasons/past | 1 | 198 | 199 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/settings | 1 | 197 | 198 | 0.1 | 0.1 | 0.1 | none |
| /api/v1/settings/keyboard | 1 | 197 | 198 | 0.1 | 0.1 | 0.1 | none |
| /api/v1/settings/personalization | 1 | 197 | 198 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/sync | 1 | 198 | 201 | 0.2 | 0.1 | 0.1 | none |
| /api/v1/today | 2 | 205 | 398 | 170 | 15.1 | 11.4 | none |
| POST /api/v1/tasks | 3 | 210 | 211 | – | – | – | undefined |
| PATCH /api/v1/tasks/:id | 6 | 403 | 404 | – | – | – | undefined |
| POST /api/v1/tasks/:id/complete | 5 | 403 | 406 | – | – | – | undefined |
| DELETE /api/v1/tasks/:id | 1 | 209 | 216 | – | – | – | undefined |

## Bundle (prod build)

Initial JS 1583 KB (479 gz) · initial CSS 368 KB (53.2 gz) · all JS 2258 KB in 8 chunks

- bulk-views-D9Z-JPmE.js 935KB (280 gz)
- index-7yfQtKa-.js 646KB (199 gz)
- settings-dialog-C8kk4dNs.js 590KB (153 gz)
- index-CcIYMc-f.css 368KB (53 gz)
- dist-BY9j4ReK.js 49KB (16 gz)
- dist-BoHMOFax.js 22KB (8 gz)
