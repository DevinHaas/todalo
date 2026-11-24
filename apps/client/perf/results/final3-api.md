# Perf run: final3-api

2026-11-24T07:02:49.111Z · git 152dd40+wip · runs 2 · CPU ×1 · 406 tasks

## Scenarios (ms, input → first frame after the change; loads from navigation start)

| scenario | p50 | p95 | base p50 | Δ | INP | TBT | extra |
|---|---|---|---|---|---|---|---|
| sheet:open | 56.1 | 56.1 | 57.3 | -2% | 0.0 | 0.0 |  |
| sheet:type | 23.7 | 23.7 | 23.4 | 1% | 0.0 | 0.0 |  |
| edit:title | 40.5 | 40.5 | 31.8 | 27% | 0.0 | 0.0 |  |
| complete | 34.6 | 34.6 | 32.8 | 5% | 40.0 | 0.0 | server 402 |
| composer:open | 16.7 | 16.7 | 16.8 | -1% | 0.0 | 0.0 |  |
| composer:type40 | 49.7 | 49.7 | 63.3 | -21% | 32.0 | 0.0 | perKey 1.2 |
| composer:add | 32.1 | 32.1 | 33.9 | -5% | 0.0 | 0.0 |  |
| scroll:today | 18.5 | 18.5 | 18.2 | 2% | – | – | janky 0.0, max 19.1 |
| quickadd:open | 18.1 | 18.1 | 18.1 | 0% | 0.0 | 0.0 |  |
| quickadd:add | 43.2 | 43.2 | 38.2 | 13% | 24.0 | 0.0 | savedAt 1040 |
| sync:other-device | 420 | 420 | 421 | -0% | – | – |  |

## React renders per interaction (React Scan, scan build, worst pass)

| scenario | renders | unnecessary | top components |
|---|---|---|---|
| sheet:open | 1234 | 0 | TaskRow 496, PendingSubtaskRows 496, anonymous 34, Property 16, Popover 12, Button 10 |
| sheet:type | 204 | 0 | anonymous 34, Property 16, Popover 12, Button 8, Plus 8, Bar 8 |
| edit:title | 1473 | 0 | TaskRow 496, PendingSubtaskRows 496, anonymous 81, Property 24, Button 22, Popover 19 |
| complete | 1165 | 0 | TaskRow 494, PendingSubtaskRows 494, anonymous 29, LinkWithRef 11, Button 10, NavLinkWithRef 7 |
| composer:open | 39 | 0 | anonymous 10, Popover 5, ContextMenuTrigger 3, MenuRoot 2, FloatingTree 2, Dropdown 2 |
| composer:type40 | 1160 | 0 | anonymous 400, Popover 200, Dropdown 80, Composer 40, Plus 40, Calendar1 40 |
| composer:add | 1276 | 0 | TaskRow 496, PendingSubtaskRows 496, anonymous 69, Popover 21, LinkWithRef 16, Button 10 |
| quickadd:open | 1013 | 0 | TaskRow 405, PendingSubtaskRows 405, anonymous 43, LinkWithRef 13, Popover 11, Button 10 |
| quickadd:add | 1077 | 0 | TaskRow 406, PendingSubtaskRows 406, anonymous 62, Popover 21, LinkWithRef 16, Button 12 |

## API routes (direct to the API: DB queries per request, p50/p95 ms over 10 calls; body KB raw / gzip / brotli; served encoding)

| route | queries | p50 | p95 | KB | gzip | br | served |
|---|---|---|---|---|---|---|---|
| /api/v1/account | 1 | 205 | 210 | 0.2 | 0.2 | 0.2 | none |
| /api/v1/calendar/events | 4 | 200 | 205 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/coach | 5 | 403 | 430 | 0.2 | 0.2 | 0.1 | none |
| /api/v1/coach/chat | 3 | 201 | 202 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/coach/drafts?timeZone=Europe%2FZurich | 1 | 199 | 201 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/goal-links | 4 | 200 | 201 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/goals | 2 | 202 | 202 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/imports/todoist?timeZone=Europe%2FZurich | 1 | 199 | 200 | 0.0 | 0.1 | 0.0 | none |
| /api/v1/metadata | 2 | 202 | 207 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/projects | 1 | 199 | 200 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/rituals?timeZone=Europe%2FZurich | 2 | 201 | 203 | 0.5 | 0.2 | 0.2 | none |
| /api/v1/seasons/current?timeZone=Europe%2FZurich | 1 | 198 | 199 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/seasons/past | 1 | 199 | 206 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/settings | 1 | 199 | 201 | 0.1 | 0.1 | 0.1 | none |
| /api/v1/settings/keyboard | 1 | 198 | 199 | 0.1 | 0.1 | 0.1 | none |
| /api/v1/settings/personalization | 1 | 198 | 199 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/sync | 3 | 198 | 199 | 0.2 | 0.1 | 0.1 | none |
| /api/v1/today | 2 | 207 | 786 | 167 | 14.8 | 11.2 | none |
| POST /api/v1/tasks | 3 | 207 | 213 | – | – | – | undefined |
| PATCH /api/v1/tasks/:id | 6 | 402 | 403 | – | – | – | undefined |
| POST /api/v1/tasks/:id/complete | 5 | 407 | 500 | – | – | – | undefined |
| DELETE /api/v1/tasks/:id | 1 | 208 | 214 | – | – | – | undefined |

## Bundle (prod build)

Initial JS 1742 KB (534 gz) · initial CSS 368 KB (53.2 gz) · all JS 2417 KB in 8 chunks

- bulk-views-BNSES4ZA.js 934KB (279 gz)
- index-CAzaJySN.js 806KB (253 gz)
- settings-dialog-YwiufHhc.js 590KB (153 gz)
- index-CcIYMc-f.css 368KB (53 gz)
- dist-BY9j4ReK.js 49KB (16 gz)
- dist-BoHMOFax.js 22KB (8 gz)
