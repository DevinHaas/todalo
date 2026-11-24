# Perf run: final5-cpu4

2026-11-24T07:41:21.091Z · git 152dd40+wip · runs 3 · CPU ×4 · 408 tasks

## Scenarios (ms, input → first frame after the change; loads from navigation start)

| scenario | p50 | p95 | base p50 | Δ | INP | TBT | extra |
|---|---|---|---|---|---|---|---|
| load:cold | 724 | 817 | 2125 | -66% | – | 151 | fcp 260, lcp 260, ttfb 1.2, jsKB 478, apiCount 3.0, domNodes 3730 |
| load:warm | 307 | 314 | 473 | -35% | – | 101 | fcp 0.0, lcp 0.0, ttfb 1.0, jsKB 2.0, apiCount 0.0, domNodes 3759 |
| tab:inbox (first) | 620 | 621 | 343 | 81% | 16.0 | 14.0 |  |
| tab:today (first) | 110 | 118 | 169 | -35% | 24.0 | 0.0 |  |
| tab:upcoming (first) | 257 | 415 | 483 | -47% | 32.0 | 54.0 |  |
| tab:inbox | 173 | 229 | 371 | -53% | 32.0 | 0.0 |  |
| tab:today | 108 | 113 | 157 | -31% | 32.0 | 0.0 |  |
| tab:upcoming | 172 | 257 | 423 | -59% | 32.0 | 0.0 |  |
| sheet:open | 171 | 176 | 324 | -47% | 0.0 | 68.0 |  |
| sheet:type | 83.4 | 83.6 | 165 | -49% | 48.0 | 0.0 |  |
| edit:title | 81.1 | 86.6 | 167 | -51% | 56.0 | 0.0 |  |
| complete | 131 | 149 | 257 | -49% | 56.0 | 0.0 | server 465 |
| composer:open | 47.9 | 52.5 | 84.6 | -43% | 40.0 | 0.0 |  |
| composer:type40 | 212 | 225 | 362 | -42% | 40.0 | 0.0 | perKey 5.3 |
| composer:add | 78.3 | 79.0 | 162 | -52% | 32.0 | 0.0 |  |
| scroll:today | 17.8 | 18.6 | 18.3 | -3% | – | – | janky 1.0, max 28.8 |
| quickadd:open | 65.5 | 66.6 | 162 | -60% | 56.0 | 0.0 |  |
| quickadd:add | 90.5 | 93.2 | 306 | -70% | 40.0 | 0.0 | savedAt 267 |
| upcoming:cold | 781 | 805 | 2190 | -64% | – | – | apiCount 6.0, domNodes 9626 |
| upcoming:warm | 364 | 367 | 820 | -56% | – | – | apiCount 0.0, domNodes 9655 |
| scroll:upcoming | 18.9 | 19.0 | 27.7 | -32% | – | – | janky 2.0, max 105 |

Cold load API waterfall (start→end ms): /api/v1/today 22→421, /api/v1/account 217→619

## React renders per interaction (React Scan, scan build, worst pass)

| scenario | renders | unnecessary | top components |
|---|---|---|---|
| tab:inbox (first) | 7740 | 0 | TaskRowWrapper 1812, PendingSubtaskRows 1812, anonymous 1251, LinkWithRef 438, Inbox 409, X 409 |
| tab:today (first) | 2925 | 0 | anonymous 529, TaskRowWrapper 500, PendingSubtaskRows 500, LinkWithRef 261, Inbox 251, X 251 |
| tab:upcoming (first) | 4983 | 0 | anonymous 1166, TaskRowWrapper 700, PendingSubtaskRows 700, LinkWithRef 361, Inbox 351, CalendarDays 351 |
| tab:inbox | 5336 | 0 | anonymous 1194, TaskRowWrapper 812, PendingSubtaskRows 812, LinkWithRef 417, X 408, Inbox 407 |
| tab:today | 2925 | 0 | anonymous 529, TaskRowWrapper 500, PendingSubtaskRows 500, LinkWithRef 261, Inbox 251, X 251 |
| tab:upcoming | 4983 | 0 | anonymous 1166, TaskRowWrapper 700, PendingSubtaskRows 700, LinkWithRef 361, Inbox 351, CalendarDays 351 |
| sheet:open | 782 | 0 | TaskRowWrapper 250, PendingSubtaskRows 250, anonymous 42, Button 18, Property 16, Popover 12 |
| sheet:type | 316 | 0 | anonymous 51, Property 24, Popover 18, Button 12, Plus 12, Bar 12 |
| edit:title | 484 | 0 | anonymous 81, Property 24, Button 22, Popover 19, Plus 17, LinkWithRef 15 |
| complete | 192 | 0 | anonymous 33, Button 14, LinkWithRef 11, NavLinkWithRef 7, Plus 6, ContextMenuTrigger 4 |
| composer:open | 39 | 0 | anonymous 10, Popover 5, ContextMenuTrigger 3, MenuRoot 2, FloatingTree 2, Dropdown 2 |
| composer:type40 | 1175 | 0 | anonymous 404, Popover 200, Dropdown 80, X 41, Paperclip 41, Composer 40 |
| composer:add | 285 | 0 | anonymous 69, Popover 21, LinkWithRef 16, Button 10, Plus 8, Dropdown 8 |
| quickadd:open | 203 | 0 | anonymous 43, LinkWithRef 13, Popover 11, Button 10, NavLinkWithRef 7, Plus 6 |
| quickadd:add | 267 | 0 | anonymous 62, Popover 21, LinkWithRef 16, Button 12, Plus 8, Dropdown 8 |

## API routes (direct to the API: DB queries per request, p50/p95 ms over 10 calls; body KB raw / gzip / brotli; served encoding)

| route | queries | p50 | p95 | KB | gzip | br | served |
|---|---|---|---|---|---|---|---|

## Bundle (prod build)

Initial JS 1583 KB (479 gz) · initial CSS 368 KB (53.2 gz) · all JS 2258 KB in 8 chunks

- bulk-views-D9Z-JPmE.js 935KB (280 gz)
- index-7yfQtKa-.js 646KB (199 gz)
- settings-dialog-C8kk4dNs.js 590KB (153 gz)
- index-CcIYMc-f.css 368KB (53 gz)
- dist-BY9j4ReK.js 49KB (16 gz)
- dist-BoHMOFax.js 22KB (8 gz)
