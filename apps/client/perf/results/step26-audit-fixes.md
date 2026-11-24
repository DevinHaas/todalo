# Perf run: step26-audit-fixes

2026-11-24T12:53:31.936Z · git 72ddb67+wip · runs 3 · CPU ×1 · 408 tasks

## Scenarios (ms, input → first frame after the change; loads from navigation start)

| scenario | p50 | p95 | INP | TBT | extra |
|---|---|---|---|---|---|
| load:cold | 437 | 992 | – | 0.0 | fcp 124, lcp 124, ttfb 2.1, jsKB 444, apiCount 2.0, domNodes 3669 |
| load:warm | 136 | 148 | – | 16.0 | fcp 0.0, lcp 0.0, ttfb 1.9, jsKB 1.0, apiCount 0.0, domNodes 3698 |
| tab:inbox (first) | 52.2 | 52.4 | 0.0 | 0.0 |  |
| tab:today (first) | 53.8 | 54.5 | 32.0 | 0.0 |  |
| tab:upcoming (first) | 52.6 | 52.9 | 0.0 | 0.0 |  |
| tab:inbox | 51.1 | 51.7 | 0.0 | 0.0 |  |
| tab:today | 53.7 | 53.9 | 32.0 | 0.0 |  |
| tab:upcoming | 48.9 | 50.3 | 0.0 | 0.0 |  |
| sheet:open | 60.3 | 65.7 | 0.0 | 0.0 |  |
| sheet:type | 23.5 | 23.8 | 0.0 | 0.0 |  |
| edit:title | 32.1 | 32.1 | 0.0 | 0.0 |  |
| complete | 32.9 | 33.2 | 24.0 | 0.0 | server 668 |
| composer:open | 16.6 | 16.9 | 0.0 | 0.0 |  |
| composer:type40 | 48.0 | 48.1 | 32.0 | 0.0 | perKey 1.2 |
| composer:add | 36.8 | 37.1 | 0.0 | 0.0 |  |
| scroll:today | 17.3 | 17.4 | – | – | janky 0.0, max 17.7 |
| quickadd:open | 17.3 | 17.9 | 0.0 | 0.0 |  |
| quickadd:add | 35.5 | 35.7 | 0.0 | 0.0 | savedAt 220 |
| upcoming:cold | 447 | 501 | – | – | apiCount 2.0, domNodes 9542 |
| upcoming:warm | 148 | 153 | – | – | apiCount 0.0, domNodes 9571 |
| scroll:upcoming | 17.5 | 17.5 | – | – | janky 1.0, max 30.2 |
| sync:other-device | 422 | 427 | – | – |  |

Cold load API waterfall (start→end ms): /api/v1/today 21→424, /api/v1/account 97→929

## React renders per interaction (React Scan, scan build, worst pass)

| scenario | renders | unnecessary | top components |
|---|---|---|---|
| tab:inbox (first) | 4509 | 0 | anonymous 1189, LinkWithRef 414, Inbox 407, X 407, TaskRowWrapper 406, TaskRowBody 406 |
| tab:today (first) | 2378 | 0 | anonymous 520, LinkWithRef 255, Inbox 248, X 248, TaskRowWrapper 247, TaskRowBody 247 |
| tab:upcoming (first) | 4360 | 0 | anonymous 1197, LinkWithRef 355, Inbox 348, CalendarDays 348, X 348, TaskRowWrapper 347 |
| tab:inbox | 4509 | 0 | anonymous 1189, LinkWithRef 414, Inbox 407, X 407, TaskRowWrapper 406, TaskRowBody 406 |
| tab:today | 2378 | 0 | anonymous 520, LinkWithRef 255, Inbox 248, X 248, TaskRowWrapper 247, TaskRowBody 247 |
| tab:upcoming | 4360 | 0 | anonymous 1197, LinkWithRef 355, Inbox 348, CalendarDays 348, X 348, TaskRowWrapper 347 |
| sheet:open | 184 | 0 | anonymous 29, Property 12, Popover 12, Bar 8, Plus 7, ContextMenuTrigger 7 |
| sheet:type | 172 | 0 | anonymous 30, Property 14, Popover 12, Button 8, Plus 8, Bar 8 |
| edit:title | 437 | 0 | anonymous 76, Button 26, Property 21, Popover 19, Plus 17, Bar 14 |
| complete | 162 | 0 | anonymous 26, Button 10, LinkWithRef 8, NavLinkWithRef 7, Plus 6, ContextMenuTrigger 4 |
| composer:open | 40 | 0 | anonymous 10, Popover 5, ContextMenuTrigger 3, MenuRoot 2, FloatingTree 2, Dropdown 2 |
| composer:type40 | 400 | 0 | anonymous 120, Composer 40, Dropdown 40, Popover 40, Inbox 40, ChevronDown 40 |
| composer:add | 234 | 0 | anonymous 52, Popover 13, LinkWithRef 13, Button 10, NavLinkWithRef 7, Plus 6 |
| quickadd:open | 194 | 0 | anonymous 40, Popover 11, LinkWithRef 10, Button 10, NavLinkWithRef 7, Plus 6 |
| quickadd:add | 228 | 0 | anonymous 49, Popover 13, LinkWithRef 13, Button 12, NavLinkWithRef 7, Plus 6 |

## API routes (direct to the API: DB queries per request, p50/p95 ms over 10 calls; body KB raw / gzip / brotli; served encoding)

| route | queries | p50 | p95 | KB | gzip | br | served |
|---|---|---|---|---|---|---|---|
| /api/v1/account | 1 | 199 | 259 | 0.2 | 0.2 | 0.2 | none |
| /api/v1/calendar/events | 3 | 197 | 262 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/coach | 5 | 400 | 459 | 0.2 | 0.2 | 0.1 | none |
| /api/v1/coach/chat | 2 | 197 | 262 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/coach/drafts?timeZone=Europe%2FZurich | 1 | 198 | 326 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/goal-links | 2 | 197 | 265 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/goals | 2 | 198 | 262 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/imports/todoist?timeZone=Europe%2FZurich | 1 | 197 | 264 | 0.0 | 0.1 | 0.0 | none |
| /api/v1/metadata | 2 | 198 | 263 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/projects | 1 | 197 | 262 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/rituals?timeZone=Europe%2FZurich | 5 | 1051 | 1242 | 0.4 | 0.2 | 0.1 | none |
| /api/v1/seasons/current?timeZone=Europe%2FZurich | 1 | 196 | 264 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/seasons/past | 1 | 195 | 268 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/settings | 1 | 197 | 264 | 0.1 | 0.1 | 0.1 | none |
| /api/v1/settings/keyboard | 1 | 196 | 263 | 0.1 | 0.1 | 0.1 | none |
| /api/v1/settings/personalization | 1 | 196 | 262 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/sync | 1 | 196 | 268 | 0.2 | 0.1 | 0.1 | none |
| /api/v1/today | 5 | 238 | 649 | 168 | 15.0 | 11.2 | none |
| POST /api/v1/tasks | 7 | 207 | 265 | – | – | – | undefined |
| PATCH /api/v1/tasks/:id | 11 | 396 | 400 | – | – | – | undefined |
| POST /api/v1/tasks/:id/complete | 5 | 399 | 400 | – | – | – | undefined |
| DELETE /api/v1/tasks/:id | 1 | 204 | 464 | – | – | – | undefined |

## Bundle (prod build)

Initial JS 1466 KB (445 gz) · initial CSS 349 KB (49.9 gz) · all JS 2229 KB in 8 chunks

- bulk-views-D560LzYi.js 796KB (240 gz)
- index-DT6kE4Xk.js 669KB (204 gz)
- settings-dialog-CeCiunqs.js 633KB (167 gz)
- index-B9FUh_Wn.css 349KB (50 gz)
- ui-gallery-COJbMwJF.js 59KB (18 gz)
- dist-BY9j4ReK.js 49KB (16 gz)
