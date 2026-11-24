# Perf run: step10b-rowstore

2026-11-24T07:09:35.674Z · git 152dd40+wip · runs 3 · CPU ×1 · 408 tasks

## Scenarios (ms, input → first frame after the change; loads from navigation start)

| scenario | p50 | p95 | base p50 | Δ | INP | TBT | extra |
|---|---|---|---|---|---|---|---|
| tab:inbox (first) | 56.2 | 57.0 | – | – | 32.0 | 5.0 |  |
| tab:today (first) | 38.6 | 39.4 | – | – | 0.0 | 0.0 |  |
| tab:upcoming (first) | 57.8 | 58.3 | – | – | 32.0 | 0.0 |  |
| tab:inbox | 49.7 | 50.9 | – | – | 0.0 | 0.0 |  |
| tab:today | 37.4 | 37.9 | – | – | 0.0 | 0.0 |  |
| tab:upcoming | 53.8 | 54.3 | – | – | 32.0 | 0.0 |  |
| sheet:open | 54.6 | 57.9 | 57.2 | -5% | 0.0 | 0.0 |  |
| sheet:type | 23.0 | 25.0 | 24.0 | -4% | 0.0 | 0.0 |  |
| edit:title | 32.1 | 32.2 | 31.7 | 1% | 0.0 | 0.0 |  |
| complete | 33.5 | 34.9 | 32.3 | 4% | 24.0 | 0.0 | server 841 |
| composer:open | 16.6 | 17.3 | 15.4 | 8% | 0.0 | 0.0 |  |
| composer:type40 | 47.9 | 48.7 | 48.7 | -2% | 32.0 | 0.0 | perKey 1.2 |
| composer:add | 33.2 | 33.4 | 32.6 | 2% | 0.0 | 0.0 |  |
| scroll:today | 18.2 | 18.3 | 18.1 | 1% | – | – | janky 0.0, max 18.6 |
| quickadd:open | 17.6 | 17.9 | 17.7 | -1% | 0.0 | 0.0 |  |
| quickadd:add | 30.1 | 43.7 | 31.6 | -5% | 0.0 | 0.0 | savedAt 238 |

## React renders per interaction (React Scan, scan build, worst pass)

| scenario | renders | unnecessary | top components |
|---|---|---|---|
| tab:inbox (first) | 5914 | 0 | anonymous 1202, TaskRowWrapper 1062, PendingSubtaskRows 1062, LinkWithRef 419, X 408, Inbox 407 |
| tab:today (first) | 2928 | 0 | anonymous 529, TaskRowWrapper 500, PendingSubtaskRows 500, LinkWithRef 261, Inbox 251, X 251 |
| tab:upcoming (first) | 4989 | 0 | anonymous 1170, TaskRowWrapper 700, PendingSubtaskRows 700, LinkWithRef 361, X 352, Inbox 351 |
| tab:inbox | 5331 | 0 | anonymous 1192, TaskRowWrapper 812, PendingSubtaskRows 812, LinkWithRef 417, Inbox 407, X 407 |
| tab:today | 2925 | 0 | anonymous 529, TaskRowWrapper 500, PendingSubtaskRows 500, LinkWithRef 261, Inbox 251, X 251 |
| tab:upcoming | 4974 | 0 | anonymous 1166, TaskRowWrapper 700, PendingSubtaskRows 700, LinkWithRef 361, Inbox 351, CalendarDays 351 |
| sheet:open | 242 | 0 | anonymous 34, Property 16, Popover 12, Button 10, FloatingTree 8, Plus 8 |
| sheet:type | 204 | 0 | anonymous 34, Property 16, Popover 12, Button 8, Plus 8, Bar 8 |
| edit:title | 484 | 0 | anonymous 81, Property 24, Button 22, Popover 19, Plus 17, LinkWithRef 15 |
| complete | 183 | 0 | anonymous 31, LinkWithRef 11, Button 10, NavLinkWithRef 7, Plus 6, ContextMenuTrigger 4 |
| composer:open | 39 | 0 | anonymous 10, Popover 5, ContextMenuTrigger 3, MenuRoot 2, FloatingTree 2, Dropdown 2 |
| composer:type40 | 1160 | 0 | anonymous 400, Popover 200, Dropdown 80, Composer 40, Plus 40, Calendar1 40 |
| composer:add | 286 | 0 | anonymous 69, Popover 21, LinkWithRef 16, Button 10, Plus 8, Dropdown 8 |
| quickadd:open | 203 | 0 | anonymous 43, LinkWithRef 13, Popover 11, Button 10, NavLinkWithRef 7, Plus 6 |
| quickadd:add | 267 | 0 | anonymous 62, Popover 21, LinkWithRef 16, Button 12, Plus 8, Dropdown 8 |

## API routes (direct to the API: DB queries per request, p50/p95 ms over 10 calls; body KB raw / gzip / brotli; served encoding)

| route | queries | p50 | p95 | KB | gzip | br | served |
|---|---|---|---|---|---|---|---|

## Bundle (prod build)

Initial JS 1743 KB (534 gz) · initial CSS 368 KB (53.2 gz) · all JS 2417 KB in 8 chunks

- bulk-views-BvG3F8EP.js 935KB (280 gz)
- index-BLb05nv_.js 806KB (254 gz)
- settings-dialog-DAwbcD_w.js 590KB (153 gz)
- index-CcIYMc-f.css 368KB (53 gz)
- dist-BY9j4ReK.js 49KB (16 gz)
- dist-BoHMOFax.js 22KB (8 gz)
