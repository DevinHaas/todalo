# Perf run: step4b-style

2026-11-24T06:18:41.079Z · git 152dd40+wip · runs 3 · CPU ×1 · 408 tasks

## Scenarios (ms, input → first frame after the change; loads from navigation start)

| scenario | p50 | p95 | base p50 | Δ | INP | TBT | extra |
|---|---|---|---|---|---|---|---|
| tab:inbox (first) | 109 | 144 | 278 | -61% | 32.0 | 2.0 |  |
| tab:today (first) | 51.9 | 52.1 | 90.5 | -43% | 0.0 | 0.0 |  |
| tab:upcoming (first) | 207 | 211 | 459 | -55% | 32.0 | 43.0 |  |
| tab:inbox | 82.1 | 110 | 170 | -52% | 32.0 | 0.0 |  |
| tab:today | 50.9 | 51.3 | 84.9 | -40% | 0.0 | 0.0 |  |
| tab:upcoming | 120 | 263 | 337 | -64% | 32.0 | 4.0 |  |
| sheet:open | 93.0 | 93.6 | 114 | -19% | 0.0 | 16.0 |  |
| sheet:type | 45.7 | 46.6 | 46.1 | -1% | 32.0 | 0.0 |  |
| edit:title | 49.3 | 49.5 | 87.6 | -44% | 32.0 | 0.0 |  |
| complete | 62.6 | 66.8 | 113 | -45% | 32.0 | 0.0 | server 595 |
| composer:open | 22.2 | 23.0 | 20.3 | 9% | 0.0 | 0.0 |  |
| composer:type40 | 59.9 | 63.6 | 61.3 | -2% | 24.0 | 0.0 | perKey 1.5 |
| composer:add | 53.2 | 53.6 | 96.3 | -45% | 32.0 | 0.0 |  |
| scroll:today | 18.4 | 18.4 | 18.3 | 1% | – | – | janky 0.0, max 18.6 |
| quickadd:open | 42.2 | 42.3 | 127 | -67% | 0.0 | 0.0 |  |
| quickadd:add | 78.0 | 81.5 | 177 | -56% | 40.0 | 0.0 | savedAt 1255 |

## React renders per interaction (React Scan, scan build, worst pass)

| scenario | renders | unnecessary | top components |
|---|---|---|---|
| tab:inbox (first) | 6032 | 0 | anonymous 1225, TaskRow 1062, PendingSubtaskRows 1062, LinkWithRef 429, X 409, Inbox 408 |
| tab:today (first) | 3069 | 0 | anonymous 556, TaskRow 500, PendingSubtaskRows 500, LinkWithRef 272, Inbox 252, X 252 |
| tab:upcoming (first) | 6919 | 0 | anonymous 1813, Plus 738, Composer 734, TaskRow 700, PendingSubtaskRows 700, LinkWithRef 361 |
| tab:inbox | 5331 | 0 | anonymous 1192, TaskRow 812, PendingSubtaskRows 812, LinkWithRef 417, Inbox 407, X 407 |
| tab:today | 3069 | 0 | anonymous 556, TaskRow 500, PendingSubtaskRows 500, LinkWithRef 272, Inbox 252, X 252 |
| tab:upcoming | 7071 | 0 | anonymous 1842, Plus 742, Composer 734, TaskRow 700, PendingSubtaskRows 700, LinkWithRef 372 |
| sheet:open | 1850 | 0 | TaskRow 750, PendingSubtaskRows 750, anonymous 51, Property 24, Popover 18, Button 12 |
| sheet:type | 204 | 0 | anonymous 34, Property 16, Popover 12, Button 8, Plus 8, Bar 8 |
| edit:title | 1482 | 0 | TaskRow 500, PendingSubtaskRows 500, anonymous 81, Property 24, Button 22, Popover 19 |
| complete | 1173 | 0 | TaskRow 498, PendingSubtaskRows 498, anonymous 29, LinkWithRef 11, Button 10, NavLinkWithRef 7 |
| composer:open | 39 | 0 | anonymous 10, Popover 5, ContextMenuTrigger 3, MenuRoot 2, FloatingTree 2, Dropdown 2 |
| composer:type40 | 1160 | 0 | anonymous 400, Popover 200, Dropdown 80, Composer 40, Plus 40, Calendar1 40 |
| composer:add | 1284 | 0 | TaskRow 500, PendingSubtaskRows 500, anonymous 69, Popover 21, LinkWithRef 16, Button 10 |
| quickadd:open | 1017 | 0 | TaskRow 407, PendingSubtaskRows 407, anonymous 43, LinkWithRef 13, Popover 11, Button 10 |
| quickadd:add | 1904 | 0 | TaskRow 816, PendingSubtaskRows 816, anonymous 62, Popover 21, LinkWithRef 16, Button 12 |

## API routes (direct to the API: DB queries per request, p50/p95 ms over 10 calls; body KB raw / gzip / brotli; served encoding)

| route | queries | p50 | p95 | KB | gzip | br | served |
|---|---|---|---|---|---|---|---|

## Bundle (prod build)

Initial JS 1736 KB (532 gz) · initial CSS 368 KB (53.2 gz) · all JS 2410 KB in 8 chunks

- bulk-views-SDrJ60iN.js 933KB (279 gz)
- index-CFMZw_EZ.js 800KB (251 gz)
- settings-dialog-CoZoHBRQ.js 590KB (153 gz)
- index-D6GBG_Ky.css 368KB (53 gz)
- dist-BY9j4ReK.js 49KB (16 gz)
- dist-BoHMOFax.js 22KB (8 gz)
