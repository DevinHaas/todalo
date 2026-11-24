# Perf run: step26-complete-recheck

2026-11-24T13:00:06.159Z · git 72ddb67+wip · runs 5 · CPU ×1 · 412 tasks

## Scenarios (ms, input → first frame after the change; loads from navigation start)

| scenario | p50 | p95 | INP | TBT | extra |
|---|---|---|---|---|---|
| sheet:open | 65.4 | 75.0 | 0.0 | 0.0 |  |
| sheet:type | 37.3 | 38.7 | 24.0 | 0.0 |  |
| edit:title | 32.0 | 32.8 | 0.0 | 0.0 |  |
| complete | 33.2 | 37.7 | 24.0 | 0.0 | server 568 |
| composer:open | 17.4 | 17.8 | 0.0 | 0.0 |  |
| composer:type40 | 63.9 | 113 | 40.0 | 0.0 | perKey 1.6 |
| composer:add | 36.9 | 38.0 | 0.0 | 0.0 |  |
| scroll:today | 17.5 | 17.6 | – | – | janky 0.0, max 17.7 |
| quickadd:open | 19.0 | 19.1 | 0.0 | 0.0 |  |
| quickadd:add | 35.4 | 46.0 | 0.0 | 0.0 | savedAt 222 |

## React renders per interaction (React Scan, scan build, worst pass)

| scenario | renders | unnecessary | top components |
|---|---|---|---|
| sheet:open | 206 | 0 | anonymous 31, Property 12, Popover 12, Plus 9, Button 8, Bar 8 |
| sheet:type | 784 | 0 | TaskRowWrapper 250, PendingSubtaskRows 250, anonymous 49, Property 21, Popover 18, Button 16 |
| edit:title | 422 | 0 | anonymous 72, Button 22, Property 21, Popover 19, Plus 17, Bar 13 |
| complete | 177 | 0 | anonymous 30, Button 14, LinkWithRef 8, NavLinkWithRef 7, Plus 6, ContextMenuTrigger 4 |
| composer:open | 40 | 0 | anonymous 10, Popover 5, ContextMenuTrigger 3, MenuRoot 2, FloatingTree 2, Dropdown 2 |
| composer:type40 | 400 | 0 | anonymous 120, Composer 40, Dropdown 40, Popover 40, Inbox 40, ChevronDown 40 |
| composer:add | 234 | 0 | anonymous 52, Popover 13, LinkWithRef 13, Button 10, NavLinkWithRef 7, Plus 6 |
| quickadd:open | 194 | 0 | anonymous 40, Popover 11, LinkWithRef 10, Button 10, NavLinkWithRef 7, Plus 6 |
| quickadd:add | 228 | 0 | anonymous 49, Popover 13, LinkWithRef 13, Button 12, NavLinkWithRef 7, Plus 6 |

## API routes (direct to the API: DB queries per request, p50/p95 ms over 10 calls; body KB raw / gzip / brotli; served encoding)

| route | queries | p50 | p95 | KB | gzip | br | served |
|---|---|---|---|---|---|---|---|

## Bundle (prod build)

Initial JS 1466 KB (445 gz) · initial CSS 349 KB (49.9 gz) · all JS 2229 KB in 8 chunks

- bulk-views-D560LzYi.js 796KB (240 gz)
- index-DT6kE4Xk.js 669KB (204 gz)
- settings-dialog-CeCiunqs.js 633KB (167 gz)
- index-B9FUh_Wn.css 349KB (50 gz)
- ui-gallery-COJbMwJF.js 59KB (18 gz)
- dist-BY9j4ReK.js 49KB (16 gz)
