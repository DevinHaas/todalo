# Perf run: step24-ui-treeshake

2026-11-24T12:31:50.095Z · git 28bc4b7+wip · runs 3 · CPU ×1 · 408 tasks

## Scenarios (ms, input → first frame after the change; loads from navigation start)

| scenario | p50 | p95 | base p50 | Δ | INP | TBT | extra |
|---|---|---|---|---|---|---|---|
| load:cold | 441 | 561 | 440 | 0% | – | 0.0 | fcp 108, lcp 108, ttfb 1.5, jsKB 444, apiCount 2.0, domNodes 3669 |
| load:warm | 134 | 142 | 118 | 13% | – | 13.0 | fcp 0.0, lcp 0.0, ttfb 2.1, jsKB 1.0, apiCount 0.0, domNodes 3698 |
| tab:inbox (first) | 53.4 | 54.2 | 58.1 | -8% | 0.0 | 0.0 |  |
| tab:today (first) | 53.7 | 54.1 | 37.6 | 43% | 32.0 | 0.0 |  |
| tab:upcoming (first) | 54.3 | 55.4 | 56.3 | -4% | 0.0 | 0.0 |  |
| tab:inbox | 49.2 | 49.3 | 57.1 | -14% | 0.0 | 0.0 |  |
| tab:today | 53.6 | 54.1 | 37.4 | 43% | 32.0 | 0.0 |  |
| tab:upcoming | 50.7 | 51.1 | 54.2 | -6% | 0.0 | 0.0 |  |
| sheet:open | 61.7 | 66.1 | 53.3 | 16% | 0.0 | 0.0 |  |
| sheet:type | 23.7 | 26.3 | 25.4 | -7% | 0.0 | 0.0 |  |
| edit:title | 31.9 | 32.0 | 29.0 | 10% | 0.0 | 0.0 |  |
| complete | 33.9 | 40.4 | 31.4 | 8% | 24.0 | 0.0 | server 411 |
| composer:open | 16.4 | 16.9 | 16.5 | -1% | 0.0 | 0.0 |  |
| composer:type40 | 47.9 | 48.1 | 47.9 | -0% | 32.0 | 0.0 | perKey 1.2 |
| composer:add | 36.9 | 37.8 | 36.5 | 1% | 0.0 | 0.0 |  |
| scroll:today | 17.3 | 17.5 | 18.0 | -4% | – | – | janky 0.0, max 17.6 |
| quickadd:open | 17.1 | 18.6 | 17.2 | -1% | 0.0 | 0.0 |  |
| quickadd:add | 32.3 | 36.2 | 30.6 | 6% | 0.0 | 0.0 | savedAt 221 |
| upcoming:cold | 462 | 467 | 469 | -2% | – | – | apiCount 2.0, domNodes 9542 |
| upcoming:warm | 158 | 160 | 137 | 15% | – | – | apiCount 0.0, domNodes 9571 |
| scroll:upcoming | 17.5 | 17.6 | 17.1 | 2% | – | – | janky 2.0, max 27.2 |
| sync:other-device | 432 | 436 | 430 | 0% | – | – |  |

Cold load API waterfall (start→end ms): /api/v1/today 18→432, /api/v1/account 88→491

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
| composer:open | 185 | 0 | anonymous 35, Button 10, LinkWithRef 9, NavLinkWithRef 7, Popover 6, Plus 6 |
| composer:type40 | 400 | 0 | anonymous 120, Composer 40, Dropdown 40, Popover 40, Inbox 40, ChevronDown 40 |
| composer:add | 234 | 0 | anonymous 52, Popover 13, LinkWithRef 13, Button 10, NavLinkWithRef 7, Plus 6 |
| quickadd:open | 194 | 0 | anonymous 40, Popover 11, LinkWithRef 10, Button 10, NavLinkWithRef 7, Plus 6 |
| quickadd:add | 228 | 0 | anonymous 49, Popover 13, LinkWithRef 13, Button 12, NavLinkWithRef 7, Plus 6 |

## API routes (direct to the API: DB queries per request, p50/p95 ms over 10 calls; body KB raw / gzip / brotli; served encoding)

| route | queries | p50 | p95 | KB | gzip | br | served |
|---|---|---|---|---|---|---|---|
| /api/v1/account | 1 | 198 | 199 | 0.2 | 0.2 | 0.2 | none |
| /api/v1/calendar/events | 3 | 199 | 199 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/coach | 5 | 396 | 399 | 0.2 | 0.2 | 0.1 | none |
| /api/v1/coach/chat | 2 | 198 | 200 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/coach/drafts?timeZone=Europe%2FZurich | 1 | 197 | 198 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/goal-links | 2 | 198 | 198 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/goals | 2 | 197 | 199 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/imports/todoist?timeZone=Europe%2FZurich | 1 | 199 | 203 | 0.0 | 0.1 | 0.0 | none |
| /api/v1/metadata | 2 | 204 | 215 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/projects | 1 | 198 | 201 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/rituals?timeZone=Europe%2FZurich | 5 | 982 | 1183 | 0.4 | 0.2 | 0.1 | none |
| /api/v1/seasons/current?timeZone=Europe%2FZurich | 1 | 198 | 198 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/seasons/past | 1 | 197 | 200 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/settings | 1 | 198 | 199 | 0.1 | 0.1 | 0.1 | none |
| /api/v1/settings/keyboard | 1 | 198 | 198 | 0.1 | 0.1 | 0.1 | none |
| /api/v1/settings/personalization | 1 | 197 | 199 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/sync | 1 | 197 | 198 | 0.2 | 0.1 | 0.1 | none |
| /api/v1/today | 5 | 207 | 207 | 168 | 15.0 | 11.2 | none |
| POST /api/v1/tasks | 3 | 201 | 202 | – | – | – | undefined |
| PATCH /api/v1/tasks/:id | 6 | 396 | 397 | – | – | – | undefined |
| POST /api/v1/tasks/:id/complete | 13 | 398 | 409 | – | – | – | undefined |
| DELETE /api/v1/tasks/:id | 3 | 200 | 202 | – | – | – | undefined |

## Bundle (prod build)

Initial JS 1465 KB (445 gz) · initial CSS 350 KB (49.9 gz) · all JS 2228 KB in 8 chunks

- bulk-views-W85LBver.js 796KB (240 gz)
- index-BwXsENkS.js 668KB (204 gz)
- settings-dialog-CnIv8Q6K.js 633KB (167 gz)
- index-U47Oo1VL.css 350KB (50 gz)
- ui-gallery-Bbk785qJ.js 59KB (18 gz)
- dist-BY9j4ReK.js 49KB (16 gz)
