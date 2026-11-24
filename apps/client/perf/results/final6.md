# Perf run: final6

2026-11-24T07:54:56.940Z · git 152dd40+wip · runs 5 · CPU ×1 · 412 tasks

## Scenarios (ms, input → first frame after the change; loads from navigation start)

| scenario | p50 | p95 | base p50 | Δ | INP | TBT | extra |
|---|---|---|---|---|---|---|---|
| load:cold | 440 | 958 | 2774 | -84% | – | 0.0 | fcp 124, lcp 124, ttfb 1.3, jsKB 478, apiCount 2.0, domNodes 3702 |
| load:warm | 118 | 128 | 2441 | -95% | – | 6.0 | fcp 0.0, lcp 0.0, ttfb 1.2, jsKB 2.0, apiCount 0.0, domNodes 3731 |
| tab:inbox (first) | 58.1 | 59.3 | 278 | -79% | 32.0 | 0.0 |  |
| tab:today (first) | 37.6 | 39.7 | 90.5 | -58% | 0.0 | 0.0 |  |
| tab:upcoming (first) | 56.3 | 60.2 | 459 | -88% | 32.0 | 0.0 |  |
| tab:inbox | 57.1 | 57.7 | 170 | -66% | 32.0 | 0.0 |  |
| tab:today | 37.4 | 38.1 | 84.9 | -56% | 0.0 | 0.0 |  |
| tab:upcoming | 54.2 | 54.8 | 337 | -84% | 32.0 | 0.0 |  |
| sheet:open | 53.3 | 54.5 | 114 | -53% | 0.0 | 0.0 |  |
| sheet:type | 25.4 | 25.6 | 46.1 | -45% | 0.0 | 0.0 |  |
| edit:title | 29.0 | 32.7 | 87.6 | -67% | 0.0 | 0.0 |  |
| complete | 31.4 | 33.6 | 113 | -72% | 24.0 | 0.0 | server 630 |
| composer:open | 16.5 | 16.6 | 20.3 | -19% | 0.0 | 0.0 |  |
| composer:type40 | 47.9 | 49.0 | 61.3 | -22% | 32.0 | 0.0 | perKey 1.2 |
| composer:add | 36.5 | 37.3 | 96.3 | -62% | 0.0 | 0.0 |  |
| scroll:today | 18.0 | 18.2 | 18.3 | -2% | – | – | janky 0.0, max 18.6 |
| quickadd:open | 17.2 | 18.5 | 127 | -86% | 0.0 | 0.0 |  |
| quickadd:add | 30.6 | 33.2 | 177 | -83% | 0.0 | 0.0 | savedAt 229 |
| upcoming:cold | 469 | 471 | 2929 | -84% | – | – | apiCount 2.0, domNodes 9574 |
| upcoming:warm | 137 | 142 | 3021 | -95% | – | – | apiCount 0.0, domNodes 9603 |
| scroll:upcoming | 17.1 | 18.1 | 38.9 | -56% | – | – | janky 1.0, max 36.6 |
| sync:other-device | 430 | 433 | 2862 | -85% | – | – |  |

Cold load API waterfall (start→end ms): /api/v1/today 19→426, /api/v1/account 87→902

## React renders per interaction (React Scan, scan build, worst pass)

| scenario | renders | unnecessary | top components |
|---|---|---|---|
| tab:inbox (first) | 4559 | 0 | anonymous 1202, LinkWithRef 421, Inbox 411, X 411, TaskRowWrapper 410, TaskRowBody 410 |
| tab:today (first) | 2380 | 0 | anonymous 519, LinkWithRef 256, Inbox 246, X 246, TaskRowWrapper 245, TaskRowBody 245 |
| tab:upcoming (first) | 4219 | 0 | anonymous 1151, LinkWithRef 356, Inbox 346, CalendarDays 346, X 346, TaskRowWrapper 345 |
| tab:inbox | 4559 | 0 | anonymous 1202, LinkWithRef 421, Inbox 411, X 411, TaskRowWrapper 410, TaskRowBody 410 |
| tab:today | 2380 | 0 | anonymous 519, LinkWithRef 256, Inbox 246, X 246, TaskRowWrapper 245, TaskRowBody 245 |
| tab:upcoming | 4219 | 0 | anonymous 1151, LinkWithRef 356, Inbox 346, CalendarDays 346, X 346, TaskRowWrapper 345 |
| sheet:open | 245 | 0 | anonymous 34, Property 16, Button 12, Popover 12, FloatingTree 8, Plus 8 |
| sheet:type | 204 | 0 | anonymous 34, Property 16, Popover 12, Button 8, Plus 8, Bar 8 |
| edit:title | 484 | 0 | anonymous 81, Property 24, Button 22, Popover 19, Plus 17, LinkWithRef 15 |
| complete | 177 | 0 | anonymous 29, LinkWithRef 11, Button 10, NavLinkWithRef 7, Plus 6, ContextMenuTrigger 4 |
| composer:open | 40 | 0 | anonymous 10, Popover 5, ContextMenuTrigger 3, MenuRoot 2, FloatingTree 2, Dropdown 2 |
| composer:type40 | 400 | 0 | anonymous 120, Composer 40, Dropdown 40, Popover 40, Inbox 40, ChevronDown 40 |
| composer:add | 249 | 0 | anonymous 55, LinkWithRef 16, Popover 13, Button 10, NavLinkWithRef 7, Plus 6 |
| quickadd:open | 205 | 0 | anonymous 43, LinkWithRef 13, Popover 11, Button 10, NavLinkWithRef 7, Plus 6 |
| quickadd:add | 239 | 0 | anonymous 52, LinkWithRef 16, Popover 13, Button 12, NavLinkWithRef 7, Plus 6 |

## API routes (direct to the API: DB queries per request, p50/p95 ms over 10 calls; body KB raw / gzip / brotli; served encoding)

| route | queries | p50 | p95 | KB | gzip | br | served |
|---|---|---|---|---|---|---|---|
| /api/v1/account | 2 | 198 | 199 | 0.2 | 0.2 | 0.2 | none |
| /api/v1/calendar/events | 4 | 198 | 203 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/coach | 5 | 399 | 402 | 0.2 | 0.2 | 0.1 | none |
| /api/v1/coach/chat | 2 | 197 | 199 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/coach/drafts?timeZone=Europe%2FZurich | 1 | 197 | 199 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/goal-links | 2 | 197 | 198 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/goals | 2 | 198 | 199 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/imports/todoist?timeZone=Europe%2FZurich | 1 | 196 | 197 | 0.0 | 0.1 | 0.0 | none |
| /api/v1/metadata | 2 | 198 | 199 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/projects | 1 | 197 | 198 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/rituals?timeZone=Europe%2FZurich | 3 | 197 | 200 | 0.5 | 0.2 | 0.2 | none |
| /api/v1/seasons/current?timeZone=Europe%2FZurich | 1 | 196 | 199 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/seasons/past | 1 | 196 | 198 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/settings | 1 | 196 | 196 | 0.1 | 0.1 | 0.1 | none |
| /api/v1/settings/keyboard | 1 | 196 | 196 | 0.1 | 0.1 | 0.1 | none |
| /api/v1/settings/personalization | 1 | 196 | 197 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/sync | 1 | 196 | 197 | 0.2 | 0.1 | 0.1 | none |
| /api/v1/today | 5 | 209 | 403 | 170 | 15.1 | 11.4 | none |
| POST /api/v1/tasks | 3 | 206 | 208 | – | – | – | undefined |
| PATCH /api/v1/tasks/:id | 6 | 396 | 400 | – | – | – | undefined |
| POST /api/v1/tasks/:id/complete | 5 | 404 | 596 | – | – | – | undefined |
| DELETE /api/v1/tasks/:id | 1 | 206 | 210 | – | – | – | undefined |

## Bundle (prod build)

Initial JS 1584 KB (480 gz) · initial CSS 368 KB (53.2 gz) · all JS 2258 KB in 8 chunks

- bulk-views-BhuEhjX_.js 935KB (280 gz)
- index-DGNh3uWp.js 646KB (199 gz)
- settings-dialog-Cc8KxtYw.js 590KB (153 gz)
- index-CcIYMc-f.css 368KB (53 gz)
- dist-BY9j4ReK.js 49KB (16 gz)
- dist-BoHMOFax.js 22KB (8 gz)
