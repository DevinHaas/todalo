# Perf run: eu-colocated

2026-11-24T11:31:08.531Z · git 152dd40+wip · runs 5 · CPU ×1 · 412 tasks

## Scenarios (ms, input → first frame after the change; loads from navigation start)

| scenario | p50 | p95 | base p50 | Δ | INP | TBT | extra |
|---|---|---|---|---|---|---|---|
| load:cold | 139 | 163 | 440 | -68% | – | 0.0 | fcp 0.0, lcp 0.0, ttfb 1.4, jsKB 478, apiCount 2.0, domNodes 3702 |
| load:warm | 67.4 | 71.7 | 118 | -43% | – | 0.0 | fcp 0.0, lcp 0.0, ttfb 1.8, jsKB 1.0, apiCount 0.0, domNodes 3699 |
| tab:inbox (first) | 48.0 | 58.6 | 58.1 | -17% | 16.0 | 0.0 |  |
| tab:today (first) | 37.3 | 37.4 | 37.6 | -1% | 16.0 | 0.0 |  |
| tab:upcoming (first) | 50.8 | 63.3 | 56.3 | -10% | 16.0 | 0.0 |  |
| tab:inbox | 42.7 | 45.5 | 57.1 | -25% | 16.0 | 0.0 |  |
| tab:today | 37.3 | 37.9 | 37.4 | -0% | 16.0 | 0.0 |  |
| tab:upcoming | 44.3 | 46.8 | 54.2 | -18% | 16.0 | 0.0 |  |
| sheet:open | 50.8 | 61.8 | 53.3 | -5% | 0.0 | 0.0 |  |
| sheet:type | 21.2 | 24.2 | 25.4 | -17% | 16.0 | 0.0 |  |
| edit:title | 30.9 | 32.8 | 29.0 | 7% | 16.0 | 0.0 |  |
| complete | 33.2 | 34.7 | 31.4 | 6% | 16.0 | 0.0 | server 37.5 |
| composer:open | 16.8 | 17.8 | 16.5 | 2% | 0.0 | 0.0 |  |
| composer:type40 | 48.5 | 48.6 | 47.9 | 1% | 24.0 | 0.0 | perKey 1.2 |
| composer:add | 36.2 | 36.5 | 36.5 | -1% | 16.0 | 0.0 |  |
| scroll:today | 17.4 | 17.6 | 18.0 | -3% | – | – | janky 0.0, max 18.0 |
| quickadd:open | 16.4 | 17.6 | 17.2 | -5% | 0.0 | 0.0 |  |
| quickadd:add | 32.5 | 35.8 | 30.6 | 6% | 0.0 | 0.0 | savedAt 46.8 |
| upcoming:cold | 157 | 170 | 469 | -67% | – | – | apiCount 6.0, domNodes 9574 |
| upcoming:warm | 96.7 | 140 | 137 | -29% | – | – | apiCount 0.0, domNodes 9571 |
| scroll:upcoming | 17.2 | 17.3 | 17.1 | 1% | – | – | janky 0.0, max 17.5 |
| sync:other-device | 65.8 | 70.7 | 430 | -85% | – | – |  |

Cold load API waterfall (start→end ms): /api/v1/today 11→39, /api/v1/account 77→113

## React renders per interaction (React Scan, scan build, worst pass)

| scenario | renders | unnecessary | top components |
|---|---|---|---|
| tab:inbox (first) | 4536 | 0 | anonymous 1197, LinkWithRef 421, Inbox 411, TaskRowWrapper 410, TaskRowBody 410, PendingAttachments 410 |
| tab:today (first) | 2349 | 0 | anonymous 514, LinkWithRef 256, Inbox 246, TaskRowWrapper 245, TaskRowBody 245, PendingAttachments 245 |
| tab:upcoming (first) | 4196 | 0 | anonymous 1146, LinkWithRef 356, Inbox 346, CalendarDays 346, TaskRowWrapper 345, TaskRowBody 345 |
| tab:inbox | 4536 | 0 | anonymous 1197, LinkWithRef 421, Inbox 411, TaskRowWrapper 410, TaskRowBody 410, PendingAttachments 410 |
| tab:today | 2349 | 0 | anonymous 514, LinkWithRef 256, Inbox 246, TaskRowWrapper 245, TaskRowBody 245, PendingAttachments 245 |
| tab:upcoming | 4196 | 0 | anonymous 1146, LinkWithRef 356, Inbox 346, CalendarDays 346, TaskRowWrapper 345, TaskRowBody 345 |
| sheet:open | 354 | 0 | anonymous 51, Property 24, Popover 18, Button 14, Plus 12, Bar 12 |
| sheet:type | 319 | 0 | anonymous 51, Property 27, Popover 18, Button 12, Plus 12, ChevronDown 9 |
| edit:title | 465 | 0 | anonymous 76, Property 27, Popover 19, Plus 17, Button 16, LinkWithRef 15 |
| complete | 156 | 0 | anonymous 24, LinkWithRef 11, NavLinkWithRef 7, Plus 6, ContextMenuTrigger 4, Button 4 |
| composer:open | 40 | 0 | anonymous 10, Popover 5, ContextMenuTrigger 3, MenuRoot 2, FloatingTree 2, Dropdown 2 |
| composer:type40 | 404 | 0 | anonymous 120, Composer 40, Dropdown 40, Popover 40, Inbox 40, ChevronDown 40 |
| composer:add | 228 | 0 | anonymous 50, LinkWithRef 16, Popover 13, NavLinkWithRef 7, Plus 6, Dropdown 6 |
| quickadd:open | 182 | 0 | anonymous 38, LinkWithRef 13, Popover 11, NavLinkWithRef 7, Plus 6, Button 4 |
| quickadd:add | 212 | 0 | anonymous 46, LinkWithRef 16, Popover 13, NavLinkWithRef 7, Plus 6, Dropdown 6 |

## API routes (direct to the API: DB queries per request, p50/p95 ms over 10 calls; body KB raw / gzip / brotli; served encoding)

| route | queries | p50 | p95 | KB | gzip | br | served |
|---|---|---|---|---|---|---|---|
| /api/v1/account | 1 | 17.8 | 18.8 | 0.2 | 0.2 | 0.2 | none |
| /api/v1/calendar/events | 3 | 20.4 | 21.8 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/coach | 5 | 36.1 | 38.0 | 0.1 | 0.1 | 0.1 | none |
| /api/v1/goal-links | 2 | 17.8 | 19.9 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/goals | 2 | 17.6 | 19.1 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/imports/todoist?timeZone=Europe%2FZurich | 1 | 17.2 | 19.2 | 0.0 | 0.1 | 0.0 | none |
| /api/v1/metadata | 2 | 19.1 | 20.2 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/projects | 1 | 17.5 | 18.4 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/rituals?timeZone=Europe%2FZurich | 5 | 82.5 | 84.8 | 0.5 | 0.2 | 0.2 | none |
| /api/v1/seasons/current?timeZone=Europe%2FZurich | 1 | 16.8 | 18.0 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/seasons/past | 1 | 16.3 | 17.8 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/settings | 1 | 16.1 | 17.2 | 0.1 | 0.1 | 0.1 | none |
| /api/v1/settings/keyboard | 1 | 16.0 | 19.2 | 0.1 | 0.1 | 0.1 | none |
| /api/v1/settings/personalization | 1 | 17.0 | 18.0 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/sync | 1 | 16.0 | 16.8 | 0.2 | 0.1 | 0.1 | none |
| /api/v1/today | 5 | 23.0 | 24.5 | 170 | 14.2 | 10.7 | none |
| POST /api/v1/tasks | 3 | 21.6 | 28.4 | – | – | – | undefined |
| PATCH /api/v1/tasks/:id | 7 | 37.0 | 39.1 | – | – | – | undefined |
| POST /api/v1/tasks/:id/complete | 5 | 38.9 | 42.9 | – | – | – | undefined |
| DELETE /api/v1/tasks/:id | 1 | 21.8 | 37.1 | – | – | – | undefined |

## Bundle (prod build)

Initial JS 1584 KB (480 gz) · initial CSS 368 KB (53.2 gz) · all JS 2259 KB in 8 chunks

- bulk-views-CtK_fgiG.js 936KB (280 gz)
- index-CEfuv9gZ.js 647KB (199 gz)
- settings-dialog-DSO3VoDy.js 590KB (153 gz)
- index-DuETLK_o.css 368KB (53 gz)
- dist-BY9j4ReK.js 49KB (16 gz)
- dist-BoHMOFax.js 22KB (8 gz)
