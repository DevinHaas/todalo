# Perf run: step5

2026-11-24T06:25:22.392Z · git 152dd40+wip · runs 5 · CPU ×1 · 412 tasks

## Scenarios (ms, input → first frame after the change; loads from navigation start)

| scenario | p50 | p95 | base p50 | Δ | INP | TBT | extra |
|---|---|---|---|---|---|---|---|
| load:cold | 1882 | 2336 | 2774 | -32% | – | 13.0 | fcp 124, lcp 124, ttfb 1.2, jsKB 530, apiCount 12.0, domNodes 3722 |
| load:warm | 1102 | 1124 | 2441 | -55% | – | 12.0 | fcp 96.0, lcp 96.0, ttfb 49.2, jsKB 1.0, apiCount 17.0, domNodes 3730 |
| tab:inbox (first) | 92.8 | 155 | 278 | -67% | 32.0 | 0.0 |  |
| tab:today (first) | 49.0 | 51.4 | 90.5 | -46% | 0.0 | 0.0 |  |
| tab:upcoming (first) | 140 | 143 | 459 | -69% | 32.0 | 6.0 |  |
| tab:inbox | 80.8 | 82.7 | 170 | -52% | 32.0 | 0.0 |  |
| tab:today | 48.0 | 50.2 | 84.9 | -43% | 0.0 | 0.0 |  |
| tab:upcoming | 132 | 134 | 337 | -61% | 32.0 | 3.0 |  |
| sheet:open | 90.1 | 92.2 | 114 | -21% | 0.0 | 12.0 |  |
| sheet:type | 45.9 | 47.0 | 46.1 | -0% | 32.0 | 0.0 |  |
| edit:title | 49.2 | 51.3 | 87.6 | -44% | 32.0 | 0.0 |  |
| complete | 62.1 | 71.8 | 113 | -45% | 32.0 | 0.0 | server 594 |
| composer:open | 21.2 | 21.8 | 20.3 | 4% | 0.0 | 0.0 |  |
| composer:type40 | 61.5 | 63.8 | 61.3 | 0% | 32.0 | 0.0 | perKey 1.5 |
| composer:add | 53.3 | 55.1 | 96.3 | -45% | 32.0 | 0.0 |  |
| scroll:today | 18.4 | 18.6 | 18.3 | 1% | – | – | janky 0.0, max 18.7 |
| quickadd:open | 42.2 | 43.8 | 127 | -67% | 0.0 | 0.0 |  |
| quickadd:add | 77.5 | 81.5 | 177 | -56% | 40.0 | 0.0 | savedAt 1255 |
| upcoming:cold | 1985 | 1988 | 2929 | -32% | – | – | apiCount 18.0, domNodes 11539 |
| upcoming:warm | 1131 | 1139 | 3021 | -63% | – | – | apiCount 18.0, domNodes 11539 |
| scroll:upcoming | 29.3 | 30.0 | 38.9 | -25% | – | – | janky 6.0, max 42.4 |
| sync:other-device | 1233 | 1254 | 2862 | -57% | – | – |  |

Cold load API waterfall (start→end ms): /api/v1/account 89→901, /api/v1/settings/keyboard 927→1132, /api/v1/rituals 928→1139, /api/v1/goals 928→1524, /api/v1/metadata 928→1529, /api/v1/projects 928→1533, /api/v1/coach 928→1733, /api/v1/today 929→1740, /api/v1/calendar/events 929→1735, /api/v1/settings/personalization 932→1723, /api/v1/imports/todoist 933→1732

## React renders per interaction (React Scan, scan build, worst pass)

| scenario | renders | unnecessary | top components |
|---|---|---|---|
| tab:inbox (first) | 5885 | 0 | anonymous 1203, TaskRow 1065, PendingSubtaskRows 1065, LinkWithRef 422, Inbox 411, X 411 |
| tab:today (first) | 2870 | 0 | anonymous 519, TaskRow 490, PendingSubtaskRows 490, LinkWithRef 256, Inbox 246, X 246 |
| tab:upcoming (first) | 6847 | 0 | anonymous 1797, Plus 738, Composer 734, TaskRow 690, PendingSubtaskRows 690, LinkWithRef 356 |
| tab:inbox | 5379 | 0 | anonymous 1202, TaskRow 820, PendingSubtaskRows 820, LinkWithRef 421, Inbox 411, X 411 |
| tab:today | 2870 | 0 | anonymous 519, TaskRow 490, PendingSubtaskRows 490, LinkWithRef 256, Inbox 246, X 246 |
| tab:upcoming | 6847 | 0 | anonymous 1797, Plus 738, Composer 734, TaskRow 690, PendingSubtaskRows 690, LinkWithRef 356 |
| sheet:open | 1222 | 0 | TaskRow 490, PendingSubtaskRows 490, anonymous 34, Property 16, Popover 12, Button 10 |
| sheet:type | 204 | 0 | anonymous 34, Property 16, Popover 12, Button 8, Plus 8, Bar 8 |
| edit:title | 1466 | 0 | TaskRow 490, PendingSubtaskRows 490, anonymous 83, Property 24, Button 22, Popover 19 |
| complete | 1153 | 0 | TaskRow 488, PendingSubtaskRows 488, anonymous 29, LinkWithRef 11, Button 10, NavLinkWithRef 7 |
| composer:open | 39 | 0 | anonymous 10, Popover 5, ContextMenuTrigger 3, MenuRoot 2, FloatingTree 2, Dropdown 2 |
| composer:type40 | 1160 | 0 | anonymous 400, Popover 200, Dropdown 80, Composer 40, Plus 40, Calendar1 40 |
| composer:add | 1264 | 0 | TaskRow 490, PendingSubtaskRows 490, anonymous 69, Popover 21, LinkWithRef 16, Button 10 |
| quickadd:open | 1025 | 0 | TaskRow 411, PendingSubtaskRows 411, anonymous 43, LinkWithRef 13, Popover 11, Button 10 |
| quickadd:add | 1089 | 0 | TaskRow 412, PendingSubtaskRows 412, anonymous 62, Popover 21, LinkWithRef 16, Button 12 |

## API routes (direct to the API: DB queries per request, p50/p95 ms over 10 calls; body KB raw / gzip / brotli; served encoding)

| route | queries | p50 | p95 | KB | gzip | br | served |
|---|---|---|---|---|---|---|---|
| /api/v1/account | 0 | 802 | 804 | 0.2 | 0.2 | 0.2 | none |
| /api/v1/calendar/events | 0 | 201 | 206 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/coach | -1 | 402 | 406 | 0.2 | 0.2 | 0.1 | none |
| /api/v1/coach/chat | 0 | 199 | 201 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/coach/drafts?timeZone=Europe%2FZurich | 0 | 199 | 200 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/goal-links | 0 | 200 | 203 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/goals | 0 | 199 | 201 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/imports/todoist?timeZone=Europe%2FZurich | 0 | 198 | 204 | 0.0 | 0.1 | 0.0 | none |
| /api/v1/metadata | -1 | 199 | 200 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/projects | 0 | 198 | 199 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/rituals?timeZone=Europe%2FZurich | 0 | 202 | 203 | 0.5 | 0.2 | 0.2 | none |
| /api/v1/seasons/current?timeZone=Europe%2FZurich | 0 | 198 | 199 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/seasons/past | -1 | 198 | 199 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/settings | 0 | 198 | 597 | 0.1 | 0.1 | 0.1 | none |
| /api/v1/settings/keyboard | 0 | 198 | 199 | 0.1 | 0.1 | 0.1 | none |
| /api/v1/settings/personalization | 1 | 198 | 200 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/sync | 0 | 198 | 199 | 0.2 | 0.1 | 0.1 | none |
| /api/v1/today | 0 | 205 | 400 | 170 | 15.1 | 11.3 | none |
| POST /api/v1/tasks | -2 | 405 | 805 | – | – | – | undefined |
| PATCH /api/v1/tasks/:id | -1 | 600 | 603 | – | – | – | undefined |
| POST /api/v1/tasks/:id/complete | -1 | 602 | 605 | – | – | – | undefined |
| DELETE /api/v1/tasks/:id | 0 | 400 | 408 | – | – | – | undefined |

## Bundle (prod build)

Initial JS 1740 KB (533 gz) · initial CSS 368 KB (53.2 gz) · all JS 2415 KB in 8 chunks

- bulk-views-AdL_GQq1.js 933KB (279 gz)
- index-BMvRpQtA.js 805KB (253 gz)
- settings-dialog-AhA5Aa66.js 590KB (153 gz)
- index-D6GBG_Ky.css 368KB (53 gz)
- dist-BY9j4ReK.js 49KB (16 gz)
- dist-BoHMOFax.js 22KB (8 gz)
