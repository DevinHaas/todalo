# Perf run: step13-compiler

2026-11-24T07:27:01.909Z · git 152dd40+wip · runs 3 · CPU ×1 · 408 tasks

## Scenarios (ms, input → first frame after the change; loads from navigation start)

| scenario | p50 | p95 | base p50 | Δ | INP | TBT | extra |
|---|---|---|---|---|---|---|---|
| load:cold | 827 | 827 | 883 | -6% | – | 0.0 | fcp 124, lcp 124, ttfb 1.4, jsKB 564, apiCount 10.0, domNodes 3719 |
| load:warm | 127 | 133 | 121 | 5% | – | 9.0 | fcp 0.0, lcp 0.0, ttfb 1.3, jsKB 2.0, apiCount 0.0, domNodes 3759 |
| tab:inbox (first) | 133 | 141 | – | – | 16.0 | 24.0 |  |
| tab:today (first) | 39.4 | 39.8 | – | – | 16.0 | 0.0 |  |
| tab:upcoming (first) | 58.2 | 78.1 | – | – | 32.0 | 0.0 |  |
| tab:inbox | 47.0 | 57.3 | – | – | 0.0 | 0.0 |  |
| tab:today | 37.4 | 43.0 | – | – | 0.0 | 0.0 |  |
| tab:upcoming | 53.9 | 55.5 | – | – | 32.0 | 0.0 |  |
| sheet:open | 54.5 | 56.0 | 58.4 | -7% | 0.0 | 0.0 |  |
| sheet:type | 23.1 | 23.6 | 24.1 | -4% | 0.0 | 0.0 |  |
| edit:title | 32.4 | 32.4 | 32.4 | 0% | 0.0 | 0.0 |  |
| complete | 33.2 | 33.6 | 32.1 | 3% | 16.0 | 0.0 | server 638 |
| composer:open | 15.8 | 16.7 | 16.6 | -5% | 0.0 | 0.0 |  |
| composer:type40 | 48.8 | 49.6 | 48.4 | 1% | 32.0 | 0.0 | perKey 1.2 |
| composer:add | 36.4 | 36.7 | 36.2 | 1% | 0.0 | 0.0 |  |
| scroll:today | 18.3 | 18.3 | 16.9 | 8% | – | – | janky 0.0, max 18.5 |
| quickadd:open | 18.1 | 18.1 | 17.3 | 5% | 0.0 | 0.0 |  |
| quickadd:add | 37.9 | 44.0 | 43.7 | -13% | 0.0 | 0.0 | savedAt 229 |

Cold load API waterfall (start→end ms): /api/v1/today 9→602, /api/v1/account 71→472

## React renders per interaction (React Scan, scan build, worst pass)

| scenario | renders | unnecessary | top components |
|---|---|---|---|
| tab:inbox (first) | 4837 | 0 | anonymous 1172, TaskRowWrapper 812, LinkWithRef 416, Inbox 407, TaskRowBody 406, PendingAttachments 406 |
| tab:today (first) | 2857 | 0 | TaskRowWrapper 750, anonymous 510, LinkWithRef 262, Inbox 251, TaskRowBody 250, PendingAttachments 250 |
| tab:upcoming (first) | 4553 | 0 | anonymous 1150, TaskRowWrapper 700, LinkWithRef 361, X 351, Inbox 351, CalendarDays 351 |
| tab:inbox | 4860 | 0 | anonymous 1176, TaskRowWrapper 812, LinkWithRef 417, Inbox 407, X 407, TaskRowBody 406 |
| tab:today | 2583 | 0 | anonymous 509, TaskRowWrapper 500, LinkWithRef 261, Inbox 251, TaskRowBody 250, PendingAttachments 250 |
| tab:upcoming | 4538 | 0 | anonymous 1146, TaskRowWrapper 700, LinkWithRef 361, Inbox 351, CalendarDays 351, TaskRowBody 350 |
| sheet:open | 732 | 0 | TaskRowWrapper 250, PendingSubtaskRows 250, anonymous 33, Property 16, Button 14, Popover 12 |
| sheet:type | 148 | 0 | anonymous 24, Property 16, Popover 12, Button 8, Plus 8, AutoGrow 6 |
| edit:title | 195 | 0 | anonymous 30, Property 16, Button 12, Popover 12, Plus 9, AutoGrow 6 |
| complete | 78 | 0 | anonymous 12, NavLinkWithRef 4, LinkWithRef 4, Button 4, TaskContextMenu 2, ContextMenu 2 |
| composer:open | 37 | 0 | anonymous 10, Popover 5, MenuRoot 2, FloatingTree 2, Dropdown 2, TaskContextMenu 1 |
| composer:type40 | 1160 | 0 | anonymous 400, Popover 200, Dropdown 80, Composer 40, Plus 40, Calendar1 40 |
| composer:add | 158 | 0 | anonymous 43, Popover 15, LinkWithRef 8, Dropdown 6, X 5, Inbox 5 |
| quickadd:open | 53 | 0 | anonymous 16, Popover 10, Dropdown 4, Composer 2, Plus 2, Calendar 2 |
| quickadd:add | 115 | 0 | anonymous 31, Popover 15, Dropdown 6, Button 6, X 5, Inbox 4 |

## API routes (direct to the API: DB queries per request, p50/p95 ms over 10 calls; body KB raw / gzip / brotli; served encoding)

| route | queries | p50 | p95 | KB | gzip | br | served |
|---|---|---|---|---|---|---|---|

## Bundle (prod build)

Initial JS 1814 KB (568 gz) · initial CSS 368 KB (53.2 gz) · all JS 2515 KB in 8 chunks

- bulk-views-BRVw8HOG.js 1044KB (318 gz)
- index-CKfcbLdV.js 768KB (249 gz)
- settings-dialog-BgG1SWcB.js 608KB (161 gz)
- index-CcIYMc-f.css 368KB (53 gz)
- dist-BY9j4ReK.js 49KB (16 gz)
- dist-BoHMOFax.js 22KB (8 gz)
