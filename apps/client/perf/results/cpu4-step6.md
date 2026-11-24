# Perf run: cpu4-step6

2026-11-24T06:34:13.822Z · git 152dd40+wip · runs 2 · CPU ×4 · 406 tasks

## Scenarios (ms, input → first frame after the change; loads from navigation start)

| scenario | p50 | p95 | INP | TBT | extra |
|---|---|---|---|---|---|
| load:cold | 2125 | 2125 | – | 231 | fcp 400, lcp 400, ttfb 3.2, jsKB 530, apiCount 18.0, domNodes 3758 |
| load:warm | 473 | 473 | – | 255 | fcp 0.0, lcp 0.0, ttfb 1.1, jsKB 1.0, apiCount 0.0, domNodes 3758 |
| tab:inbox (first) | 343 | 343 | 32.0 | 129 |  |
| tab:today (first) | 169 | 169 | 32.0 | 24.0 |  |
| tab:upcoming (first) | 483 | 483 | 32.0 | 246 |  |
| tab:inbox | 371 | 371 | 32.0 | 165 |  |
| tab:today | 157 | 157 | 32.0 | 24.0 |  |
| tab:upcoming | 423 | 423 | 32.0 | 226 |  |
| sheet:open | 324 | 324 | 0.0 | 221 |  |
| sheet:type | 165 | 165 | 96.0 | 22.0 |  |
| edit:title | 167 | 167 | 128 | 72.0 |  |
| complete | 257 | 257 | 120 | 61.0 | server 610 |
| composer:open | 84.6 | 84.6 | 80.0 | 15.0 |  |
| composer:type40 | 362 | 362 | 64.0 | 4.0 | perKey 9.1 |
| composer:add | 162 | 162 | 72.0 | 14.0 |  |
| scroll:today | 18.3 | 18.3 | – | – | janky 2.0, max 38.9 |
| quickadd:open | 162 | 162 | 0.0 | 100 |  |
| quickadd:add | 306 | 306 | 144 | 176 | savedAt 1502 |
| upcoming:cold | 2190 | 2190 | – | – | apiCount 19.0, domNodes 9654 |
| upcoming:warm | 820 | 820 | – | – | apiCount 0.0, domNodes 9654 |
| scroll:upcoming | 27.7 | 27.7 | – | – | janky 7.0, max 66.8 |

Cold load API waterfall (start→end ms): /api/v1/account 320→917, /api/v1/settings/keyboard 995→1196, /api/v1/rituals 998→1206, /api/v1/goals 1000→1613, /api/v1/metadata 1001→1617, /api/v1/projects 1001→1594, /api/v1/today 1004→1984, /api/v1/calendar/events 1005→1411, /api/v1/settings/personalization 1012→1615, /api/v1/imports/todoist 1017→1792, /api/v1/settings 1017→1814, /api/v1/seasons/current 1630→1834, /api/v1/seasons/past 1631→1988, /api/v1/goal-links 1633→2016, /api/v1/sync 1639→2038

## React renders per interaction (React Scan, scan build, worst pass)

| scenario | renders | unnecessary | top components |
|---|---|---|---|
| tab:inbox (first) | 5307 | 0 | anonymous 1187, TaskRow 808, PendingSubtaskRows 808, LinkWithRef 415, Inbox 405, X 405 |
| tab:today (first) | 2925 | 0 | anonymous 529, TaskRow 500, PendingSubtaskRows 500, LinkWithRef 261, Inbox 251, X 251 |
| tab:upcoming (first) | 4990 | 0 | anonymous 1167, TaskRow 700, PendingSubtaskRows 700, LinkWithRef 361, Inbox 351, CalendarDays 351 |
| tab:inbox | 5312 | 0 | anonymous 1189, TaskRow 808, PendingSubtaskRows 808, LinkWithRef 415, X 406, Inbox 405 |
| tab:today | 2925 | 0 | anonymous 529, TaskRow 500, PendingSubtaskRows 500, LinkWithRef 261, Inbox 251, X 251 |
| tab:upcoming | 4990 | 0 | anonymous 1167, TaskRow 700, PendingSubtaskRows 700, LinkWithRef 361, Inbox 351, CalendarDays 351 |
| sheet:open | 1247 | 0 | TaskRow 500, PendingSubtaskRows 500, anonymous 36, Property 16, Popover 12, Button 10 |
| sheet:type | 818 | 0 | TaskRow 250, PendingSubtaskRows 250, anonymous 51, Property 25, Popover 18, Button 12 |
| edit:title | 2097 | 0 | TaskRow 750, PendingSubtaskRows 750, anonymous 98, Property 36, Button 26, Popover 25 |
| complete | 1173 | 0 | TaskRow 498, PendingSubtaskRows 498, anonymous 29, LinkWithRef 11, Button 10, NavLinkWithRef 7 |
| composer:open | 2453 | 0 | anonymous 540, LinkWithRef 261, X 252, Inbox 251, TaskRow 249, TaskRowBody 249 |
| composer:type40 | 1164 | 0 | anonymous 400, Popover 200, Dropdown 80, Composer 40, Plus 40, Calendar1 40 |
| composer:add | 1283 | 0 | TaskRow 500, PendingSubtaskRows 500, anonymous 69, Popover 21, LinkWithRef 16, Button 10 |
| quickadd:open | 1013 | 0 | TaskRow 405, PendingSubtaskRows 405, anonymous 43, LinkWithRef 13, Popover 11, Button 10 |
| quickadd:add | 1077 | 0 | TaskRow 406, PendingSubtaskRows 406, anonymous 62, Popover 21, LinkWithRef 16, Button 12 |

## API routes (direct to the API: DB queries per request, p50/p95 ms over 10 calls; body KB raw / gzip / brotli; served encoding)

| route | queries | p50 | p95 | KB | gzip | br | served |
|---|---|---|---|---|---|---|---|

## Bundle (prod build)

Initial JS 1741 KB (533 gz) · initial CSS 368 KB (53.2 gz) · all JS 2415 KB in 8 chunks

- bulk-views-AdL_GQq1.js 933KB (279 gz)
- index-BrxR7THQ.js 805KB (253 gz)
- settings-dialog-U7x39Nw-.js 590KB (153 gz)
- index-D6GBG_Ky.css 368KB (53 gz)
- dist-BY9j4ReK.js 49KB (16 gz)
- dist-BoHMOFax.js 22KB (8 gz)
