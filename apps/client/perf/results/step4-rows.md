# Perf run: step4-rows

2026-11-24T06:14:50.570Z · git 152dd40+wip · runs 3 · CPU ×1 · 408 tasks

## Scenarios (ms, input → first frame after the change; loads from navigation start)

| scenario | p50 | p95 | base p50 | Δ | INP | TBT | extra |
|---|---|---|---|---|---|---|---|
| tab:inbox (first) | 190 | 248 | 278 | -32% | 32.0 | 72.0 |  |
| tab:today (first) | 107 | 108 | 90.5 | 18% | 32.0 | 17.0 |  |
| tab:upcoming (first) | 204 | 333 | 459 | -56% | 32.0 | 23.0 |  |
| tab:inbox | 174 | 229 | 170 | 3% | 24.0 | 35.0 |  |
| tab:today | 107 | 109 | 84.9 | 26% | 32.0 | 15.0 |  |
| tab:upcoming | 196 | 196 | 337 | -42% | 32.0 | 23.0 |  |
| sheet:open | 89.8 | 93.5 | 114 | -21% | 0.0 | 14.0 |  |
| sheet:type | 46.9 | 48.3 | 46.1 | 2% | 32.0 | 0.0 |  |
| edit:title | 73.5 | 75.4 | 87.6 | -16% | 32.0 | 0.0 |  |
| complete | 96.7 | 106 | 113 | -14% | 32.0 | 0.0 | server 594 |
| composer:open | 20.0 | 20.7 | 20.3 | -1% | 0.0 | 0.0 |  |
| composer:type40 | 61.9 | 62.3 | 61.3 | 1% | 32.0 | 0.0 | perKey 1.5 |
| composer:add | 81.5 | 81.6 | 96.3 | -15% | 32.0 | 0.0 |  |
| scroll:today | 18.4 | 18.5 | 18.3 | 1% | – | – | janky 1.0, max 45.2 |
| quickadd:open | 113 | 114 | 127 | -11% | 0.0 | 57.0 |  |
| quickadd:add | 152 | 159 | 177 | -14% | 40.0 | 16.0 | savedAt 1247 |

## React renders per interaction (React Scan, scan build, worst pass)

| scenario | renders | unnecessary | top components |
|---|---|---|---|
| tab:inbox (first) | 5483 | 0 | anonymous 1219, TaskRow 812, PendingSubtaskRows 812, LinkWithRef 428, Inbox 408, X 408 |
| tab:today (first) | 3069 | 0 | anonymous 556, TaskRow 500, PendingSubtaskRows 500, LinkWithRef 272, Inbox 252, X 252 |
| tab:upcoming (first) | 8765 | 0 | anonymous 2187, Plus 1105, Composer 1101, TaskRow 1050, PendingSubtaskRows 1050, LinkWithRef 361 |
| tab:inbox | 7292 | 0 | anonymous 1587, TaskRow 1162, PendingSubtaskRows 1162, LinkWithRef 428, Inbox 408, X 408 |
| tab:today | 3069 | 0 | anonymous 556, TaskRow 500, PendingSubtaskRows 500, LinkWithRef 272, Inbox 252, X 252 |
| tab:upcoming | 6929 | 0 | anonymous 1813, Plus 738, Composer 734, TaskRow 700, PendingSubtaskRows 700, LinkWithRef 361 |
| sheet:open | 1850 | 0 | TaskRow 750, PendingSubtaskRows 750, anonymous 51, Property 24, Popover 18, Button 12 |
| sheet:type | 209 | 0 | anonymous 36, Property 16, Popover 12, Button 8, Plus 8, Bar 8 |
| edit:title | 1481 | 0 | TaskRow 500, PendingSubtaskRows 500, anonymous 81, Property 24, Button 22, Popover 19 |
| complete | 1173 | 0 | TaskRow 498, PendingSubtaskRows 498, anonymous 29, LinkWithRef 11, Button 10, NavLinkWithRef 7 |
| composer:open | 39 | 0 | anonymous 10, Popover 5, ContextMenuTrigger 3, MenuRoot 2, FloatingTree 2, Dropdown 2 |
| composer:type40 | 1160 | 0 | anonymous 400, Popover 200, Dropdown 80, Composer 40, Plus 40, Calendar1 40 |
| composer:add | 1835 | 0 | TaskRow 750, PendingSubtaskRows 750, anonymous 83, Popover 26, LinkWithRef 17, Button 14 |
| quickadd:open | 1017 | 0 | TaskRow 407, PendingSubtaskRows 407, anonymous 43, LinkWithRef 13, Popover 11, Button 10 |
| quickadd:add | 1904 | 0 | TaskRow 816, PendingSubtaskRows 816, anonymous 62, Popover 21, LinkWithRef 16, Button 12 |

## API routes (direct to the API: DB queries per request, p50/p95 ms over 10 calls; body KB raw / gzip / brotli; served encoding)

| route | queries | p50 | p95 | KB | gzip | br | served |
|---|---|---|---|---|---|---|---|

## Bundle (prod build)

Initial JS 1735 KB (532 gz) · initial CSS 368 KB (53.2 gz) · all JS 2410 KB in 8 chunks

- bulk-views-SDrJ60iN.js 933KB (279 gz)
- index-DaqJ4wZJ.js 800KB (251 gz)
- settings-dialog-DL8KEPBi.js 590KB (153 gz)
- index-D6GBG_Ky.css 368KB (53 gz)
- dist-BY9j4ReK.js 49KB (16 gz)
- dist-BoHMOFax.js 22KB (8 gz)
