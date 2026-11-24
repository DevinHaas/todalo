# Perf run: cpu4-cv

2026-11-24T06:35:58.060Z · git 152dd40+wip · runs 2 · CPU ×4 · 406 tasks

## Scenarios (ms, input → first frame after the change; loads from navigation start)

| scenario | p50 | p95 | base p50 | Δ | INP | TBT | extra |
|---|---|---|---|---|---|---|---|
| tab:inbox (first) | 237 | 237 | 343 | -31% | 32.0 | 0.0 |  |
| tab:today (first) | 116 | 116 | 169 | -31% | 32.0 | 0.0 |  |
| tab:upcoming (first) | 328 | 328 | 483 | -32% | 32.0 | 101 |  |
| tab:inbox | 246 | 246 | 371 | -34% | 32.0 | 29.0 |  |
| tab:today | 108 | 108 | 157 | -32% | 32.0 | 0.0 |  |
| tab:upcoming | 281 | 281 | 423 | -34% | 32.0 | 85.0 |  |
| sheet:open | 184 | 184 | 324 | -43% | 0.0 | 78.0 |  |
| sheet:type | 111 | 111 | 165 | -33% | 48.0 | 0.0 |  |
| edit:title | 91.8 | 91.8 | 167 | -45% | 56.0 | 0.0 |  |
| complete | 134 | 134 | 257 | -48% | 48.0 | 0.0 | server 604 |
| composer:open | 49.1 | 49.1 | 84.6 | -42% | 40.0 | 0.0 |  |
| composer:type40 | 249 | 249 | 362 | -31% | 40.0 | 0.0 | perKey 6.2 |
| composer:add | 108 | 108 | 162 | -34% | 40.0 | 0.0 |  |
| scroll:today | 18.7 | 18.7 | 18.3 | 2% | – | – | janky 2.0, max 37.4 |
| quickadd:open | 72.4 | 72.4 | 162 | -55% | 0.0 | 3.0 |  |
| quickadd:add | 118 | 118 | 306 | -61% | 48.0 | 0.0 | savedAt 1277 |
| upcoming:cold | 2049 | 2049 | 2190 | -6% | – | – | apiCount 19.0, domNodes 9654 |
| upcoming:warm | 433 | 433 | 820 | -47% | – | – | apiCount 0.0, domNodes 9654 |
| scroll:upcoming | 28.7 | 28.7 | 27.7 | 4% | – | – | janky 6.0, max 61.4 |

## React renders per interaction (React Scan, scan build, worst pass)

| scenario | renders | unnecessary | top components |
|---|---|---|---|
| tab:inbox (first) | 5307 | 0 | anonymous 1187, TaskRow 808, PendingSubtaskRows 808, LinkWithRef 415, Inbox 405, X 405 |
| tab:today (first) | 2930 | 0 | anonymous 531, TaskRow 500, PendingSubtaskRows 500, LinkWithRef 261, X 252, Inbox 251 |
| tab:upcoming (first) | 4990 | 0 | anonymous 1167, TaskRow 700, PendingSubtaskRows 700, LinkWithRef 361, Inbox 351, CalendarDays 351 |
| tab:inbox | 5307 | 0 | anonymous 1187, TaskRow 808, PendingSubtaskRows 808, LinkWithRef 415, Inbox 405, X 405 |
| tab:today | 2925 | 0 | anonymous 529, TaskRow 500, PendingSubtaskRows 500, LinkWithRef 261, Inbox 251, X 251 |
| tab:upcoming | 4995 | 0 | anonymous 1169, TaskRow 700, PendingSubtaskRows 700, LinkWithRef 361, X 352, Inbox 351 |
| sheet:open | 1247 | 0 | TaskRow 500, PendingSubtaskRows 500, anonymous 36, Property 16, Popover 12, Button 10 |
| sheet:type | 204 | 0 | anonymous 34, Property 16, Popover 12, Button 8, Plus 8, Bar 8 |
| edit:title | 2077 | 0 | TaskRow 750, PendingSubtaskRows 750, anonymous 98, Property 33, Button 26, Popover 25 |
| complete | 1173 | 0 | TaskRow 498, PendingSubtaskRows 498, anonymous 29, LinkWithRef 11, Button 10, NavLinkWithRef 7 |
| composer:open | 695 | 0 | TaskRow 249, PendingSubtaskRows 249, anonymous 38, LinkWithRef 12, Button 10, NavLinkWithRef 7 |
| composer:type40 | 1163 | 0 | anonymous 400, Popover 200, Dropdown 80, Composer 40, Plus 40, Calendar1 40 |
| composer:add | 1284 | 0 | TaskRow 500, PendingSubtaskRows 500, anonymous 69, Popover 21, LinkWithRef 16, Button 10 |
| quickadd:open | 1013 | 0 | TaskRow 405, PendingSubtaskRows 405, anonymous 43, LinkWithRef 13, Popover 11, Button 10 |
| quickadd:add | 1077 | 0 | TaskRow 406, PendingSubtaskRows 406, anonymous 62, Popover 21, LinkWithRef 16, Button 12 |

## API routes (direct to the API: DB queries per request, p50/p95 ms over 10 calls; body KB raw / gzip / brotli; served encoding)

| route | queries | p50 | p95 | KB | gzip | br | served |
|---|---|---|---|---|---|---|---|

## Bundle (prod build)

Initial JS 1741 KB (533 gz) · initial CSS 368 KB (53.2 gz) · all JS 2415 KB in 8 chunks

- bulk-views-AdL_GQq1.js 933KB (279 gz)
- index-DgP9TUGl.js 805KB (253 gz)
- settings-dialog-BRgLdULe.js 590KB (153 gz)
- index-CcIYMc-f.css 368KB (53 gz)
- dist-BY9j4ReK.js 49KB (16 gz)
- dist-BoHMOFax.js 22KB (8 gz)
