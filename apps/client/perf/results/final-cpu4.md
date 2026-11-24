# Perf run: final-cpu4

2026-11-24T06:47:33.893Z · git 152dd40+wip · runs 3 · CPU ×4 · 408 tasks

## Scenarios (ms, input → first frame after the change; loads from navigation start)

| scenario | p50 | p95 | base p50 | Δ | INP | TBT | extra |
|---|---|---|---|---|---|---|---|
| load:cold | 1043 | 1060 | 2125 | -51% | – | 156 | fcp 260, lcp 260, ttfb 1.3, jsKB 531, apiCount 2.0, domNodes 3729 |
| load:warm | 307 | 312 | 473 | -35% | – | 94.0 | fcp 0.0, lcp 0.0, ttfb 0.9, jsKB 1.0, apiCount 0.0, domNodes 3758 |
| tab:inbox (first) | 266 | 611 | 343 | -22% | 16.0 | 0.0 |  |
| tab:today (first) | 103 | 169 | 169 | -39% | 24.0 | 0.0 |  |
| tab:upcoming (first) | 293 | 535 | 483 | -39% | 32.0 | 21.0 |  |
| tab:inbox | 164 | 254 | 371 | -56% | 32.0 | 0.0 |  |
| tab:today | 107 | 124 | 157 | -32% | 32.0 | 0.0 |  |
| tab:upcoming | 167 | 193 | 423 | -61% | 32.0 | 0.0 |  |
| sheet:open | 175 | 181 | 324 | -46% | 0.0 | 74.0 |  |
| sheet:type | 96.9 | 110 | 165 | -41% | 48.0 | 0.0 |  |
| edit:title | 88.8 | 93.1 | 167 | -47% | 48.0 | 0.0 |  |
| complete | 156 | 157 | 257 | -39% | 64.0 | 0.0 | server 600 |
| composer:open | 48.3 | 53.0 | 84.6 | -43% | 40.0 | 0.0 |  |
| composer:type40 | 259 | 300 | 362 | -29% | 40.0 | 0.0 | perKey 6.5 |
| composer:add | 90.5 | 91.9 | 162 | -44% | 32.0 | 0.0 |  |
| scroll:today | 18.9 | 19.3 | 18.3 | 3% | – | – | janky 2.0, max 25.1 |
| quickadd:open | 68.3 | 68.3 | 162 | -58% | 64.0 | 0.0 |  |
| quickadd:add | 100 | 106 | 306 | -67% | 48.0 | 0.0 | savedAt 1282 |
| upcoming:cold | 1131 | 1146 | 2190 | -48% | – | – | apiCount 6.0, domNodes 9625 |
| upcoming:warm | 362 | 363 | 820 | -56% | – | – | apiCount 0.0, domNodes 9654 |
| scroll:upcoming | 19.0 | 19.5 | 27.7 | -31% | – | – | janky 4.0, max 97.1 |

Cold load API waterfall (start→end ms): /api/v1/today 174→761, /api/v1/account 218→816

## React renders per interaction (React Scan, scan build, worst pass)

| scenario | renders | unnecessary | top components |
|---|---|---|---|
| tab:inbox (first) | 9232 | 0 | TaskRow 2562, PendingSubtaskRows 2562, anonymous 1252, LinkWithRef 440, Inbox 409, X 409 |
| tab:today (first) | 2925 | 0 | anonymous 529, TaskRow 500, PendingSubtaskRows 500, LinkWithRef 261, Inbox 251, X 251 |
| tab:upcoming (first) | 4995 | 0 | anonymous 1169, TaskRow 700, PendingSubtaskRows 700, LinkWithRef 361, X 352, Inbox 351 |
| tab:inbox | 5331 | 0 | anonymous 1192, TaskRow 812, PendingSubtaskRows 812, LinkWithRef 417, Inbox 407, X 407 |
| tab:today | 2925 | 0 | anonymous 529, TaskRow 500, PendingSubtaskRows 500, LinkWithRef 261, Inbox 251, X 251 |
| tab:upcoming | 4990 | 0 | anonymous 1167, TaskRow 700, PendingSubtaskRows 700, LinkWithRef 361, Inbox 351, CalendarDays 351 |
| sheet:open | 1782 | 0 | TaskRow 750, PendingSubtaskRows 750, anonymous 42, Button 18, Property 16, Popover 12 |
| sheet:type | 816 | 0 | TaskRow 250, PendingSubtaskRows 250, anonymous 51, Property 24, Popover 18, Button 12 |
| edit:title | 1481 | 0 | TaskRow 500, PendingSubtaskRows 500, anonymous 81, Property 24, Button 22, Popover 19 |
| complete | 1173 | 0 | TaskRow 498, PendingSubtaskRows 498, anonymous 29, LinkWithRef 11, Button 10, NavLinkWithRef 7 |
| composer:open | 695 | 0 | TaskRow 249, PendingSubtaskRows 249, anonymous 38, LinkWithRef 12, Button 10, NavLinkWithRef 7 |
| composer:type40 | 1175 | 0 | anonymous 404, Popover 200, Dropdown 80, X 41, Paperclip 41, Composer 40 |
| composer:add | 1284 | 0 | TaskRow 500, PendingSubtaskRows 500, anonymous 69, Popover 21, LinkWithRef 16, Button 10 |
| quickadd:open | 1017 | 0 | TaskRow 407, PendingSubtaskRows 407, anonymous 43, LinkWithRef 13, Popover 11, Button 10 |
| quickadd:add | 1081 | 0 | TaskRow 408, PendingSubtaskRows 408, anonymous 62, Popover 21, LinkWithRef 16, Button 12 |

## API routes (direct to the API: DB queries per request, p50/p95 ms over 10 calls; body KB raw / gzip / brotli; served encoding)

| route | queries | p50 | p95 | KB | gzip | br | served |
|---|---|---|---|---|---|---|---|

## Bundle (prod build)

Initial JS 1741 KB (534 gz) · initial CSS 368 KB (53.2 gz) · all JS 2416 KB in 8 chunks

- bulk-views-RPeh7F_m.js 934KB (279 gz)
- index-CDDx1D5f.js 806KB (253 gz)
- settings-dialog-DFAUs8nn.js 590KB (153 gz)
- index-CcIYMc-f.css 368KB (53 gz)
- dist-BY9j4ReK.js 49KB (16 gz)
- dist-BoHMOFax.js 22KB (8 gz)
