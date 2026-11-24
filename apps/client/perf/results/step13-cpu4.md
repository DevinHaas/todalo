# Perf run: step13-cpu4

2026-11-24T07:28:11.584Z · git 152dd40+wip · runs 3 · CPU ×4 · 408 tasks

## Scenarios (ms, input → first frame after the change; loads from navigation start)

| scenario | p50 | p95 | base p50 | Δ | INP | TBT | extra |
|---|---|---|---|---|---|---|---|
| load:cold | 892 | 898 | 1040 | -14% | – | 161 | fcp 264, lcp 264, ttfb 1.3, jsKB 564, apiCount 7.0, domNodes 3719 |
| load:warm | 317 | 371 | 310 | 2% | – | 106 | fcp 0.0, lcp 0.0, ttfb 1.0, jsKB 2.0, apiCount 0.0, domNodes 3759 |
| tab:inbox (first) | 182 | 688 | – | – | 16.0 | 0.0 |  |
| tab:today (first) | 123 | 250 | – | – | 32.0 | 0.0 |  |
| tab:upcoming (first) | 267 | 466 | – | – | 24.0 | 63.0 |  |
| tab:inbox | 243 | 248 | – | – | 24.0 | 36.0 |  |
| tab:today | 106 | 109 | – | – | 32.0 | 0.0 |  |
| tab:upcoming | 227 | 267 | – | – | 32.0 | 49.0 |  |
| sheet:open | 155 | 168 | 153 | 1% | 0.0 | 62.0 |  |
| sheet:type | 82.7 | 93.7 | 93.0 | -11% | 40.0 | 0.0 |  |
| edit:title | 69.3 | 70.5 | 77.8 | -11% | 0.0 | 0.0 |  |
| complete | 133 | 149 | 133 | -0% | 56.0 | 0.0 | server 480 |
| composer:open | 50.7 | 53.7 | 50.1 | 1% | 40.0 | 0.0 |  |
| composer:type40 | 232 | 385 | 232 | 0% | 40.0 | 0.0 | perKey 5.8 |
| composer:add | 69.2 | 81.6 | 87.4 | -21% | 32.0 | 0.0 |  |
| scroll:today | 18.5 | 18.8 | 18.6 | -1% | – | – | janky 1.0, max 22.9 |
| quickadd:open | 49.1 | 49.9 | 66.8 | -26% | 0.0 | 0.0 |  |
| quickadd:add | 90.6 | 95.8 | 90.1 | 1% | 48.0 | 0.0 | savedAt 265 |

Cold load API waterfall (start→end ms): /api/v1/today 24→614, /api/v1/account 224→621

## React renders per interaction (React Scan, scan build, worst pass)

| scenario | renders | unnecessary | top components |
|---|---|---|---|
| tab:inbox (first) | 6184 | 0 | TaskRowWrapper 1562, anonymous 1185, PendingSubtaskRows 906, LinkWithRef 418, X 408, Inbox 407 |
| tab:today (first) | 2583 | 0 | anonymous 509, TaskRowWrapper 500, LinkWithRef 261, Inbox 251, TaskRowBody 250, PendingAttachments 250 |
| tab:upcoming (first) | 4541 | 0 | anonymous 1146, TaskRowWrapper 700, LinkWithRef 361, Inbox 351, CalendarDays 351, TaskRowBody 350 |
| tab:inbox | 4844 | 0 | anonymous 1174, TaskRowWrapper 812, LinkWithRef 417, X 407, Inbox 407, TaskRowBody 406 |
| tab:today | 2583 | 0 | anonymous 509, TaskRowWrapper 500, LinkWithRef 261, Inbox 251, TaskRowBody 250, PendingAttachments 250 |
| tab:upcoming | 4541 | 0 | anonymous 1146, TaskRowWrapper 700, LinkWithRef 361, Inbox 351, CalendarDays 351, TaskRowBody 350 |
| sheet:open | 215 | 0 | anonymous 29, Property 16, Popover 12, Button 10, FloatingTree 8, Plus 8 |
| sheet:type | 236 | 0 | anonymous 36, Property 24, Popover 18, Button 12, Plus 12, AutoGrow 9 |
| edit:title | 195 | 0 | anonymous 30, Property 16, Button 12, Popover 12, Plus 9, AutoGrow 6 |
| complete | 93 | 0 | anonymous 16, Button 8, NavLinkWithRef 4, LinkWithRef 4, Bar 2, LiquidCoach 2 |
| composer:open | 819 | 0 | TaskRowWrapper 498, TaskRowBody 249, anonymous 15, Popover 5, Button 4, MenuRoot 3 |
| composer:type40 | 1178 | 0 | anonymous 404, Popover 200, Dropdown 80, X 41, Paperclip 41, Composer 40 |
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
