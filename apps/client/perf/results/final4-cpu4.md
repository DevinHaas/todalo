# Perf run: final4-cpu4

2026-11-24T07:16:22.671Z · git 152dd40+wip · runs 3 · CPU ×4 · 408 tasks

## Scenarios (ms, input → first frame after the change; loads from navigation start)

| scenario | p50 | p95 | base p50 | Δ | INP | TBT | extra |
|---|---|---|---|---|---|---|---|
| load:cold | 1072 | 1078 | 2125 | -50% | – | 150 | fcp 280, lcp 280, ttfb 1.2, jsKB 531, apiCount 10.0, domNodes 3718 |
| load:warm | 311 | 316 | 473 | -34% | – | 96.0 | fcp 0.0, lcp 0.0, ttfb 1.0, jsKB 1.0, apiCount 0.0, domNodes 3758 |
| tab:inbox (first) | 417 | 418 | 343 | 22% | 32.0 | 26.0 |  |
| tab:today (first) | 113 | 125 | 169 | -33% | 32.0 | 0.0 |  |
| tab:upcoming (first) | 264 | 269 | 483 | -45% | 32.0 | 62.0 |  |
| tab:inbox | 172 | 229 | 371 | -54% | 32.0 | 0.0 |  |
| tab:today | 116 | 146 | 157 | -26% | 32.0 | 0.0 |  |
| tab:upcoming | 232 | 233 | 423 | -45% | 32.0 | 45.0 |  |
| sheet:open | 151 | 169 | 324 | -53% | 0.0 | 60.0 |  |
| sheet:type | 79.5 | 86.0 | 165 | -52% | 48.0 | 0.0 |  |
| edit:title | 74.8 | 80.3 | 167 | -55% | 48.0 | 0.0 |  |
| complete | 133 | 134 | 257 | -48% | 56.0 | 0.0 | server 458 |
| composer:open | 52.3 | 62.1 | 84.6 | -38% | 48.0 | 0.0 |  |
| composer:type40 | 277 | 451 | 362 | -24% | 40.0 | 0.0 | perKey 6.9 |
| composer:add | 91.3 | 99.9 | 162 | -44% | 32.0 | 0.0 |  |
| scroll:today | 18.6 | 18.6 | 18.3 | 2% | – | – | janky 1.0, max 37.8 |
| quickadd:open | 65.7 | 79.5 | 162 | -59% | 56.0 | 0.0 |  |
| quickadd:add | 97.1 | 110 | 306 | -68% | 48.0 | 0.0 | savedAt 311 |
| upcoming:cold | 1128 | 1145 | 2190 | -48% | – | – | apiCount 13.0, domNodes 9614 |
| upcoming:warm | 384 | 389 | 820 | -53% | – | – | apiCount 0.0, domNodes 9654 |
| scroll:upcoming | 18.8 | 19.0 | 27.7 | -32% | – | – | janky 1.0, max 111 |

Cold load API waterfall (start→end ms): /api/v1/today 176→771, /api/v1/account 220→613

## React renders per interaction (React Scan, scan build, worst pass)

| scenario | renders | unnecessary | top components |
|---|---|---|---|
| tab:inbox (first) | 6950 | 0 | TaskRowWrapper 1562, PendingSubtaskRows 1562, anonymous 1206, LinkWithRef 419, X 409, Inbox 407 |
| tab:today (first) | 2925 | 0 | anonymous 529, TaskRowWrapper 500, PendingSubtaskRows 500, LinkWithRef 261, Inbox 251, X 251 |
| tab:upcoming (first) | 4988 | 0 | anonymous 1168, TaskRowWrapper 700, PendingSubtaskRows 700, LinkWithRef 361, X 352, Inbox 351 |
| tab:inbox | 5331 | 0 | anonymous 1192, TaskRowWrapper 812, PendingSubtaskRows 812, LinkWithRef 417, Inbox 407, X 407 |
| tab:today | 2925 | 0 | anonymous 529, TaskRowWrapper 500, PendingSubtaskRows 500, LinkWithRef 261, Inbox 251, X 251 |
| tab:upcoming | 4983 | 0 | anonymous 1166, TaskRowWrapper 700, PendingSubtaskRows 700, LinkWithRef 361, Inbox 351, CalendarDays 351 |
| sheet:open | 242 | 0 | anonymous 34, Property 16, Popover 12, Button 10, FloatingTree 8, Plus 8 |
| sheet:type | 316 | 0 | anonymous 51, Property 24, Popover 18, Button 12, Plus 12, Bar 12 |
| edit:title | 484 | 0 | anonymous 81, Property 24, Button 22, Popover 19, Plus 17, LinkWithRef 15 |
| complete | 192 | 0 | anonymous 33, Button 14, LinkWithRef 11, NavLinkWithRef 7, Plus 6, ContextMenuTrigger 4 |
| composer:open | 39 | 0 | anonymous 10, Popover 5, ContextMenuTrigger 3, MenuRoot 2, FloatingTree 2, Dropdown 2 |
| composer:type40 | 1160 | 0 | anonymous 400, Popover 200, Dropdown 80, Composer 40, Plus 40, Calendar1 40 |
| composer:add | 285 | 0 | anonymous 69, Popover 21, LinkWithRef 16, Button 10, Plus 8, Dropdown 8 |
| quickadd:open | 203 | 0 | anonymous 43, LinkWithRef 13, Popover 11, Button 10, NavLinkWithRef 7, Plus 6 |
| quickadd:add | 267 | 0 | anonymous 62, Popover 21, LinkWithRef 16, Button 12, Plus 8, Dropdown 8 |

## API routes (direct to the API: DB queries per request, p50/p95 ms over 10 calls; body KB raw / gzip / brotli; served encoding)

| route | queries | p50 | p95 | KB | gzip | br | served |
|---|---|---|---|---|---|---|---|

## Bundle (prod build)

Initial JS 1743 KB (534 gz) · initial CSS 368 KB (53.2 gz) · all JS 2418 KB in 8 chunks

- bulk-views-rf7P_hSs.js 935KB (280 gz)
- index-BrzMTmhE.js 806KB (254 gz)
- settings-dialog-DEzojiuJ.js 590KB (153 gz)
- index-CcIYMc-f.css 368KB (53 gz)
- dist-BY9j4ReK.js 49KB (16 gz)
- dist-BoHMOFax.js 22KB (8 gz)
