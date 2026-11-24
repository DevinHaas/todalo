# Perf run: final6-cpu4

2026-11-24T07:57:53.671Z · git 152dd40+wip · runs 3 · CPU ×4 · 408 tasks

## Scenarios (ms, input → first frame after the change; loads from navigation start)

| scenario | p50 | p95 | base p50 | Δ | INP | TBT | extra |
|---|---|---|---|---|---|---|---|
| load:cold | 620 | 1192 | 2125 | -71% | – | 136 | fcp 276, lcp 276, ttfb 1.1, jsKB 478, apiCount 2.0, domNodes 3730 |
| load:warm | 301 | 311 | 473 | -36% | – | 95.0 | fcp 0.0, lcp 0.0, ttfb 0.9, jsKB 2.0, apiCount 0.0, domNodes 3759 |
| tab:inbox (first) | 169 | 177 | 343 | -51% | 24.0 | 0.0 |  |
| tab:today (first) | 113 | 121 | 169 | -33% | 32.0 | 0.0 |  |
| tab:upcoming (first) | 257 | 263 | 483 | -47% | 32.0 | 57.0 |  |
| tab:inbox | 237 | 238 | 371 | -36% | 32.0 | 27.0 |  |
| tab:today | 104 | 104 | 157 | -34% | 32.0 | 0.0 |  |
| tab:upcoming | 165 | 167 | 423 | -61% | 32.0 | 0.0 |  |
| sheet:open | 164 | 179 | 324 | -49% | 0.0 | 83.0 |  |
| sheet:type | 93.5 | 101 | 165 | -43% | 40.0 | 0.0 |  |
| edit:title | 84.7 | 85.0 | 167 | -49% | 48.0 | 0.0 |  |
| complete | 137 | 137 | 257 | -47% | 56.0 | 0.0 | server 477 |
| composer:open | 50.8 | 53.4 | 84.6 | -40% | 40.0 | 0.0 |  |
| composer:type40 | 181 | 391 | 362 | -50% | 40.0 | 0.0 | perKey 4.5 |
| composer:add | 73.0 | 87.6 | 162 | -55% | 32.0 | 0.0 |  |
| scroll:today | 18.5 | 18.7 | 18.3 | 1% | – | – | janky 2.0, max 29.9 |
| quickadd:open | 65.4 | 68.9 | 162 | -60% | 0.0 | 0.0 |  |
| quickadd:add | 91.1 | 97.1 | 306 | -70% | 40.0 | 0.0 | savedAt 266 |
| upcoming:cold | 677 | 679 | 2190 | -69% | – | – | apiCount 2.0, domNodes 9626 |
| upcoming:warm | 356 | 366 | 820 | -57% | – | – | apiCount 0.0, domNodes 9655 |
| scroll:upcoming | 18.2 | 18.5 | 27.7 | -34% | – | – | janky 1.0, max 112 |

Cold load API waterfall (start→end ms): /api/v1/today 24→431, /api/v1/account 210→1003

## React renders per interaction (React Scan, scan build, worst pass)

| scenario | renders | unnecessary | top components |
|---|---|---|---|
| tab:inbox (first) | 4519 | 0 | anonymous 1192, LinkWithRef 417, Inbox 407, X 407, TaskRowWrapper 406, TaskRowBody 406 |
| tab:today (first) | 2425 | 0 | anonymous 529, LinkWithRef 261, Inbox 251, X 251, TaskRowWrapper 250, TaskRowBody 250 |
| tab:upcoming (first) | 4288 | 0 | anonymous 1168, LinkWithRef 361, X 352, Inbox 351, CalendarDays 351, TaskRowWrapper 350 |
| tab:inbox | 4519 | 0 | anonymous 1192, LinkWithRef 417, Inbox 407, X 407, TaskRowWrapper 406, TaskRowBody 406 |
| tab:today | 2425 | 0 | anonymous 529, LinkWithRef 261, Inbox 251, X 251, TaskRowWrapper 250, TaskRowBody 250 |
| tab:upcoming | 4283 | 0 | anonymous 1166, LinkWithRef 361, Inbox 351, CalendarDays 351, X 351, TaskRowWrapper 350 |
| sheet:open | 1312 | 0 | TaskRowWrapper 500, PendingSubtaskRows 500, anonymous 44, Button 20, Property 16, Popover 12 |
| sheet:type | 204 | 0 | anonymous 34, Property 16, Popover 12, Button 8, Plus 8, Bar 8 |
| edit:title | 484 | 0 | anonymous 81, Property 24, Button 22, Popover 19, Plus 17, LinkWithRef 15 |
| complete | 192 | 0 | anonymous 33, Button 14, LinkWithRef 11, NavLinkWithRef 7, Plus 6, ContextMenuTrigger 4 |
| composer:open | 198 | 0 | anonymous 38, LinkWithRef 12, Button 10, NavLinkWithRef 7, Popover 6, Plus 6 |
| composer:type40 | 400 | 0 | anonymous 120, Composer 40, Dropdown 40, Popover 40, Inbox 40, ChevronDown 40 |
| composer:add | 249 | 0 | anonymous 55, LinkWithRef 16, Popover 13, Button 10, NavLinkWithRef 7, Plus 6 |
| quickadd:open | 205 | 0 | anonymous 43, LinkWithRef 13, Popover 11, Button 10, NavLinkWithRef 7, Plus 6 |
| quickadd:add | 239 | 0 | anonymous 52, LinkWithRef 16, Popover 13, Button 12, NavLinkWithRef 7, Plus 6 |

## API routes (direct to the API: DB queries per request, p50/p95 ms over 10 calls; body KB raw / gzip / brotli; served encoding)

| route | queries | p50 | p95 | KB | gzip | br | served |
|---|---|---|---|---|---|---|---|

## Bundle (prod build)

Initial JS 1584 KB (480 gz) · initial CSS 368 KB (53.2 gz) · all JS 2258 KB in 8 chunks

- bulk-views-BhuEhjX_.js 935KB (280 gz)
- index-DGNh3uWp.js 646KB (199 gz)
- settings-dialog-Cc8KxtYw.js 590KB (153 gz)
- index-CcIYMc-f.css 368KB (53 gz)
- dist-BY9j4ReK.js 49KB (16 gz)
- dist-BoHMOFax.js 22KB (8 gz)
