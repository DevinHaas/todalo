# Perf run: step10-rowstore

2026-11-24T07:08:15.223Z · git 152dd40+wip · runs 3 · CPU ×1 · 408 tasks

## Scenarios (ms, input → first frame after the change; loads from navigation start)

| scenario | p50 | p95 | base p50 | Δ | INP | TBT | extra |
|---|---|---|---|---|---|---|---|
| tab:inbox (first) | 47.6 | 55.9 | – | – | 24.0 | 7.0 |  |
| tab:today (first) | 39.8 | 40.0 | – | – | 0.0 | 0.0 |  |
| tab:upcoming (first) | 57.7 | 58.6 | – | – | 32.0 | 0.0 |  |
| tab:inbox | 46.3 | 67.1 | – | – | 0.0 | 0.0 |  |
| tab:today | 37.8 | 40.0 | – | – | 0.0 | 0.0 |  |
| tab:upcoming | 54.0 | 71.1 | – | – | 32.0 | 0.0 |  |
| sheet:open | 56.8 | 65.3 | 57.2 | -1% | 0.0 | 0.0 |  |
| sheet:type | 23.0 | 23.8 | 24.0 | -4% | 0.0 | 0.0 |  |
| edit:title | 32.5 | 32.8 | 31.7 | 3% | 0.0 | 0.0 |  |
| complete | 33.0 | 37.1 | 32.3 | 2% | 40.0 | 0.0 | server 851 |
| composer:open | 17.6 | 18.0 | 15.4 | 14% | 0.0 | 0.0 |  |
| composer:type40 | 47.9 | 48.8 | 48.7 | -2% | 0.0 | 0.0 | perKey 1.2 |
| composer:add | 33.8 | 34.7 | 32.6 | 4% | 0.0 | 0.0 |  |
| scroll:today | 18.3 | 18.4 | 18.1 | 1% | – | – | janky 0.0, max 18.6 |
| quickadd:open | 18.4 | 18.6 | 17.7 | 4% | 0.0 | 0.0 |  |
| quickadd:add | 30.5 | 31.1 | 31.6 | -3% | 0.0 | 0.0 | savedAt 235 |

## React renders per interaction (React Scan, scan build, worst pass)

| scenario | renders | unnecessary | top components |
|---|---|---|---|
| tab:inbox (first) | 6409 | 0 | TaskRowWrapper 1312, PendingSubtaskRows 1312, anonymous 1201, LinkWithRef 418, X 408, Inbox 407 |
| tab:today (first) | 2925 | 0 | anonymous 529, TaskRowWrapper 500, PendingSubtaskRows 500, LinkWithRef 261, Inbox 251, X 251 |
| tab:upcoming (first) | 4974 | 0 | anonymous 1166, TaskRowWrapper 700, PendingSubtaskRows 700, LinkWithRef 361, Inbox 351, CalendarDays 351 |
| tab:inbox | 5331 | 0 | anonymous 1192, TaskRowWrapper 812, PendingSubtaskRows 812, LinkWithRef 417, Inbox 407, X 407 |
| tab:today | 2925 | 0 | anonymous 529, TaskRowWrapper 500, PendingSubtaskRows 500, LinkWithRef 261, Inbox 251, X 251 |
| tab:upcoming | 4974 | 0 | anonymous 1166, TaskRowWrapper 700, PendingSubtaskRows 700, LinkWithRef 361, Inbox 351, CalendarDays 351 |
| sheet:open | 1242 | 0 | TaskRowWrapper 500, PendingSubtaskRows 500, anonymous 34, Property 16, Popover 12, Button 10 |
| sheet:type | 204 | 0 | anonymous 34, Property 16, Popover 12, Button 8, Plus 8, Bar 8 |
| edit:title | 1482 | 0 | TaskRowWrapper 501, PendingSubtaskRows 500, anonymous 81, Property 24, Button 22, Popover 19 |
| complete | 676 | 0 | TaskRowWrapper 249, PendingSubtaskRows 249, anonymous 29, LinkWithRef 11, Button 10, NavLinkWithRef 7 |
| composer:open | 39 | 0 | anonymous 10, Popover 5, ContextMenuTrigger 3, MenuRoot 2, FloatingTree 2, Dropdown 2 |
| composer:type40 | 1160 | 0 | anonymous 400, Popover 200, Dropdown 80, Composer 40, Plus 40, Calendar1 40 |
| composer:add | 786 | 0 | TaskRowWrapper 251, PendingSubtaskRows 251, anonymous 69, Popover 21, LinkWithRef 16, Button 10 |
| quickadd:open | 1017 | 0 | TaskRowWrapper 407, PendingSubtaskRows 407, anonymous 43, LinkWithRef 13, Popover 11, Button 10 |
| quickadd:add | 1081 | 0 | TaskRowWrapper 408, PendingSubtaskRows 408, anonymous 62, Popover 21, LinkWithRef 16, Button 12 |

## API routes (direct to the API: DB queries per request, p50/p95 ms over 10 calls; body KB raw / gzip / brotli; served encoding)

| route | queries | p50 | p95 | KB | gzip | br | served |
|---|---|---|---|---|---|---|---|

## Bundle (prod build)

Initial JS 1743 KB (534 gz) · initial CSS 368 KB (53.2 gz) · all JS 2417 KB in 8 chunks

- bulk-views-BvG3F8EP.js 935KB (280 gz)
- index-EJ-EOTe2.js 806KB (254 gz)
- settings-dialog-l9oE4NmC.js 590KB (153 gz)
- index-CcIYMc-f.css 368KB (53 gz)
- dist-BY9j4ReK.js 49KB (16 gz)
- dist-BoHMOFax.js 22KB (8 gz)
