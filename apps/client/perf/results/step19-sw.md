# Perf run: step19-sw

2026-11-24T08:06:48.713Z · git 152dd40+wip · runs 3 · CPU ×1 · 408 tasks

## Scenarios (ms, input → first frame after the change; loads from navigation start)

| scenario | p50 | p95 | base p50 | Δ | INP | TBT | extra |
|---|---|---|---|---|---|---|---|
| load:cold | 438 | 931 | 440 | -1% | – | 0.0 | fcp 124, lcp 124, ttfb 1.3, jsKB 478, apiCount 2.0, domNodes 3716 |
| load:warm | 121 | 127 | 118 | 3% | – | 7.0 | fcp 0.0, lcp 0.0, ttfb 2.0, jsKB 1.0, apiCount 0.0, domNodes 3745 |
| tab:inbox (first) | 57.3 | 57.5 | 58.1 | -1% | 32.0 | 0.0 |  |
| tab:today (first) | 37.6 | 38.7 | 37.6 | 0% | 0.0 | 0.0 |  |
| tab:upcoming (first) | 56.0 | 58.0 | 56.3 | -1% | 32.0 | 0.0 |  |
| tab:inbox | 57.2 | 58.2 | 57.1 | 0% | 32.0 | 0.0 |  |
| tab:today | 37.5 | 37.6 | 37.4 | 0% | 0.0 | 0.0 |  |
| tab:upcoming | 54.2 | 54.4 | 54.2 | 0% | 32.0 | 0.0 |  |
| sheet:open | 55.3 | 55.9 | 53.3 | 4% | 0.0 | 0.0 |  |
| sheet:type | 22.8 | 23.7 | 25.4 | -10% | 0.0 | 0.0 |  |
| edit:title | 29.2 | 33.4 | 29.0 | 1% | 0.0 | 0.0 |  |
| complete | 32.6 | 32.8 | 31.4 | 4% | 24.0 | 0.0 | server 637 |
| composer:open | 16.7 | 16.7 | 16.5 | 1% | 0.0 | 0.0 |  |
| composer:type40 | 47.7 | 48.2 | 47.9 | -0% | 32.0 | 0.0 | perKey 1.2 |
| composer:add | 36.7 | 36.8 | 36.5 | 1% | 0.0 | 0.0 |  |
| scroll:today | 18.2 | 18.4 | 18.0 | 1% | – | – | janky 0.0, max 18.5 |
| quickadd:open | 17.5 | 17.7 | 17.2 | 2% | 0.0 | 0.0 |  |
| quickadd:add | 31.0 | 32.5 | 30.6 | 1% | 0.0 | 0.0 | savedAt 218 |
| sync:other-device | 416 | 427 | 430 | -3% | – | – |  |

Cold load API waterfall (start→end ms): /api/v1/today 9→411, /api/v1/account 69→865

## React renders per interaction (React Scan, scan build, worst pass)

| scenario | renders | unnecessary | top components |
|---|---|---|---|
| tab:inbox (first) | 4519 | 0 | anonymous 1192, LinkWithRef 417, Inbox 407, X 407, TaskRowWrapper 406, TaskRowBody 406 |
| tab:today (first) | 2398 | 0 | anonymous 523, LinkWithRef 258, Inbox 248, X 248, TaskRowWrapper 247, TaskRowBody 247 |
| tab:upcoming (first) | 4241 | 0 | anonymous 1157, LinkWithRef 358, Inbox 348, CalendarDays 348, X 348, TaskRowWrapper 347 |
| tab:inbox | 4519 | 0 | anonymous 1192, LinkWithRef 417, Inbox 407, X 407, TaskRowWrapper 406, TaskRowBody 406 |
| tab:today | 2398 | 0 | anonymous 523, LinkWithRef 258, Inbox 248, X 248, TaskRowWrapper 247, TaskRowBody 247 |
| tab:upcoming | 4241 | 0 | anonymous 1157, LinkWithRef 358, Inbox 348, CalendarDays 348, X 348, TaskRowWrapper 347 |
| sheet:open | 245 | 0 | anonymous 34, Property 16, Button 12, Popover 12, FloatingTree 8, Plus 8 |
| sheet:type | 826 | 0 | TaskRowWrapper 247, PendingSubtaskRows 247, anonymous 55, Property 24, Popover 18, Button 16 |
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

## Bundle (prod build)

Initial JS 1584 KB (480 gz) · initial CSS 368 KB (53.2 gz) · all JS 2259 KB in 8 chunks

- bulk-views-BhuEhjX_.js 935KB (280 gz)
- index-D_5tG33n.js 646KB (199 gz)
- settings-dialog-C3Fra3bl.js 590KB (153 gz)
- index-CcIYMc-f.css 368KB (53 gz)
- dist-BY9j4ReK.js 49KB (16 gz)
- dist-BoHMOFax.js 22KB (8 gz)
