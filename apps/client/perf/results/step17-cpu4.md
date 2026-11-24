# Perf run: step17-cpu4

2026-11-24T07:51:35.876Z · git 152dd40+wip · runs 3 · CPU ×4 · 408 tasks

## Scenarios (ms, input → first frame after the change; loads from navigation start)

| scenario | p50 | p95 | base p50 | Δ | INP | TBT | extra |
|---|---|---|---|---|---|---|---|
| sheet:open | 173 | 177 | 171 | 1% | 0.0 | 71.0 |  |
| sheet:type | 82.6 | 99.4 | 83.4 | -1% | 40.0 | 0.0 |  |
| edit:title | 79.4 | 95.6 | 81.1 | -2% | 48.0 | 0.0 |  |
| complete | 137 | 139 | 131 | 4% | 56.0 | 0.0 | server 440 |
| composer:open | 49.6 | 50.5 | 47.9 | 4% | 40.0 | 0.0 |  |
| composer:type40 | 228 | 245 | 212 | 8% | 40.0 | 0.0 | perKey 5.7 |
| composer:add | 77.2 | 78.5 | 78.3 | -1% | 32.0 | 0.0 |  |
| scroll:today | 18.4 | 18.5 | 17.8 | 3% | – | – | janky 1.0, max 29.8 |
| quickadd:open | 66.3 | 66.6 | 65.5 | 1% | 56.0 | 0.0 |  |
| quickadd:add | 90.1 | 90.9 | 90.5 | -0% | 40.0 | 0.0 | savedAt 268 |

## React renders per interaction (React Scan, scan build, worst pass)

| scenario | renders | unnecessary | top components |
|---|---|---|---|
| sheet:open | 1289 | 0 | TaskRowWrapper 500, PendingSubtaskRows 500, anonymous 42, Button 18, Property 16, Popover 12 |
| sheet:type | 316 | 0 | anonymous 51, Property 24, Popover 18, Button 12, Plus 12, Bar 12 |
| edit:title | 484 | 0 | anonymous 81, Property 24, Button 22, Popover 19, Plus 17, LinkWithRef 15 |
| complete | 192 | 0 | anonymous 33, Button 14, LinkWithRef 11, NavLinkWithRef 7, Plus 6, ContextMenuTrigger 4 |
| composer:open | 40 | 0 | anonymous 10, Popover 5, ContextMenuTrigger 3, MenuRoot 2, FloatingTree 2, Dropdown 2 |
| composer:type40 | 415 | 0 | anonymous 124, Composer 40, Dropdown 40, Popover 40, Inbox 40, ChevronDown 40 |
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
