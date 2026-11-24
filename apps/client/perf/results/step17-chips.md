# Perf run: step17-chips

2026-11-24T07:50:57.510Z · git 152dd40+wip · runs 3 · CPU ×1 · 408 tasks

## Scenarios (ms, input → first frame after the change; loads from navigation start)

| scenario | p50 | p95 | base p50 | Δ | INP | TBT | extra |
|---|---|---|---|---|---|---|---|
| sheet:open | 56.1 | 64.3 | 53.6 | 5% | 0.0 | 0.0 |  |
| sheet:type | 24.4 | 25.6 | 24.6 | -1% | 0.0 | 0.0 |  |
| edit:title | 32.4 | 32.7 | 31.5 | 3% | 0.0 | 0.0 |  |
| complete | 31.4 | 33.1 | 30.5 | 3% | 16.0 | 0.0 | server 624 |
| composer:open | 16.7 | 16.8 | 16.7 | 0% | 0.0 | 0.0 |  |
| composer:type40 | 47.7 | 49.5 | 48.1 | -1% | 32.0 | 0.0 | perKey 1.2 |
| composer:add | 36.9 | 37.0 | 36.3 | 2% | 0.0 | 0.0 |  |
| scroll:today | 16.8 | 18.0 | 18.4 | -9% | – | – | janky 0.0, max 18.5 |
| quickadd:open | 17.3 | 17.5 | 17.5 | -1% | 0.0 | 0.0 |  |
| quickadd:add | 29.4 | 29.9 | 31.5 | -7% | 0.0 | 0.0 | savedAt 230 |

## React renders per interaction (React Scan, scan build, worst pass)

| scenario | renders | unnecessary | top components |
|---|---|---|---|
| sheet:open | 245 | 0 | anonymous 34, Property 16, Button 12, Popover 12, FloatingTree 8, Plus 8 |
| sheet:type | 832 | 0 | TaskRowWrapper 250, PendingSubtaskRows 250, anonymous 55, Property 24, Popover 18, Button 16 |
| edit:title | 484 | 0 | anonymous 81, Property 24, Button 22, Popover 19, Plus 17, LinkWithRef 15 |
| complete | 177 | 0 | anonymous 29, LinkWithRef 11, Button 10, NavLinkWithRef 7, Plus 6, ContextMenuTrigger 4 |
| composer:open | 40 | 0 | anonymous 10, Popover 5, ContextMenuTrigger 3, MenuRoot 2, FloatingTree 2, Dropdown 2 |
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
