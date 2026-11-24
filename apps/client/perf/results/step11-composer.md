# Perf run: step11-composer

2026-11-24T07:21:10.477Z · git 152dd40+wip · runs 3 · CPU ×1 · 408 tasks

## Scenarios (ms, input → first frame after the change; loads from navigation start)

| scenario | p50 | p95 | base p50 | Δ | INP | TBT | extra |
|---|---|---|---|---|---|---|---|
| load:cold | 883 | 898 | 875 | 1% | – | 0.0 | fcp 124, lcp 140, ttfb 1.6, jsKB 477, apiCount 10.0, domNodes 3729 |
| load:warm | 121 | 130 | 121 | 0% | – | 7.0 | fcp 0.0, lcp 0.0, ttfb 1.2, jsKB 1.0, apiCount 0.0, domNodes 3758 |
| sheet:open | 58.4 | 59.1 | 55.1 | 6% | 0.0 | 0.0 |  |
| sheet:type | 24.1 | 24.7 | 24.9 | -3% | 0.0 | 0.0 |  |
| edit:title | 32.4 | 32.6 | 32.3 | 0% | 0.0 | 0.0 |  |
| complete | 32.1 | 33.3 | 30.0 | 7% | 24.0 | 0.0 | server 647 |
| composer:open | 16.6 | 16.7 | 16.6 | 0% | 0.0 | 0.0 |  |
| composer:type40 | 48.4 | 48.7 | 48.5 | -0% | 32.0 | 0.0 | perKey 1.2 |
| composer:add | 36.2 | 36.4 | 33.5 | 8% | 0.0 | 0.0 |  |
| scroll:today | 16.9 | 18.3 | 17.7 | -5% | – | – | janky 0.0, max 17.7 |
| quickadd:open | 17.3 | 17.3 | 17.2 | 1% | 0.0 | 0.0 |  |
| quickadd:add | 43.7 | 43.9 | 39.9 | 10% | 0.0 | 0.0 | savedAt 229 |

Cold load API waterfall (start→end ms): /api/v1/today 78→676, /api/v1/account 84→482

## React renders per interaction (React Scan, scan build, worst pass)

| scenario | renders | unnecessary | top components |
|---|---|---|---|
| sheet:open | 242 | 0 | anonymous 34, Property 16, Popover 12, Button 10, FloatingTree 8, Plus 8 |
| sheet:type | 204 | 0 | anonymous 34, Property 16, Popover 12, Button 8, Plus 8, Bar 8 |
| edit:title | 484 | 0 | anonymous 81, Property 24, Button 22, Popover 19, Plus 17, LinkWithRef 15 |
| complete | 177 | 0 | anonymous 29, LinkWithRef 11, Button 10, NavLinkWithRef 7, Plus 6, ContextMenuTrigger 4 |
| composer:open | 39 | 0 | anonymous 10, Popover 5, ContextMenuTrigger 3, MenuRoot 2, FloatingTree 2, Dropdown 2 |
| composer:type40 | 1160 | 0 | anonymous 400, Popover 200, Dropdown 80, Composer 40, Plus 40, Calendar1 40 |
| composer:add | 285 | 0 | anonymous 69, Popover 21, LinkWithRef 16, Button 10, Plus 8, Dropdown 8 |
| quickadd:open | 203 | 0 | anonymous 43, LinkWithRef 13, Popover 11, Button 10, NavLinkWithRef 7, Plus 6 |
| quickadd:add | 267 | 0 | anonymous 62, Popover 21, LinkWithRef 16, Button 12, Plus 8, Dropdown 8 |

## API routes (direct to the API: DB queries per request, p50/p95 ms over 10 calls; body KB raw / gzip / brotli; served encoding)

| route | queries | p50 | p95 | KB | gzip | br | served |
|---|---|---|---|---|---|---|---|

## Bundle (prod build)

Initial JS 1583 KB (479 gz) · initial CSS 368 KB (53.2 gz) · all JS 2257 KB in 8 chunks

- bulk-views-D9Z-JPmE.js 935KB (280 gz)
- index-lB3w3wVn.js 646KB (199 gz)
- settings-dialog-DlriRd1m.js 590KB (153 gz)
- index-CcIYMc-f.css 368KB (53 gz)
- dist-BY9j4ReK.js 49KB (16 gz)
- dist-BoHMOFax.js 22KB (8 gz)
