# Perf run: step11-cpu4

2026-11-24T07:22:09.011Z · git 152dd40+wip · runs 3 · CPU ×4 · 408 tasks

## Scenarios (ms, input → first frame after the change; loads from navigation start)

| scenario | p50 | p95 | base p50 | Δ | INP | TBT | extra |
|---|---|---|---|---|---|---|---|
| load:cold | 1040 | 1043 | 1072 | -3% | – | 150 | fcp 244, lcp 244, ttfb 1.2, jsKB 477, apiCount 10.0, domNodes 3718 |
| load:warm | 310 | 357 | 311 | -0% | – | 102 | fcp 0.0, lcp 0.0, ttfb 1.0, jsKB 1.0, apiCount 0.0, domNodes 3758 |
| sheet:open | 153 | 165 | 151 | 1% | 0.0 | 63.0 |  |
| sheet:type | 93.0 | 98.3 | 79.5 | 17% | 48.0 | 0.0 |  |
| edit:title | 77.8 | 78.2 | 74.8 | 4% | 48.0 | 0.0 |  |
| complete | 133 | 137 | 133 | -0% | 56.0 | 0.0 | server 443 |
| composer:open | 50.1 | 50.6 | 52.3 | -4% | 40.0 | 0.0 |  |
| composer:type40 | 232 | 235 | 277 | -16% | 40.0 | 0.0 | perKey 5.8 |
| composer:add | 87.4 | 87.8 | 91.3 | -4% | 40.0 | 0.0 |  |
| scroll:today | 18.6 | 19.0 | 18.6 | 0% | – | – | janky 1.0, max 25.3 |
| quickadd:open | 66.8 | 66.9 | 65.7 | 2% | 64.0 | 0.0 |  |
| quickadd:add | 90.1 | 92.8 | 97.1 | -7% | 48.0 | 0.0 | savedAt 273 |

Cold load API waterfall (start→end ms): /api/v1/today 168→752, /api/v1/account 210→606

## React renders per interaction (React Scan, scan build, worst pass)

| scenario | renders | unnecessary | top components |
|---|---|---|---|
| sheet:open | 242 | 0 | anonymous 34, Property 16, Popover 12, Button 10, FloatingTree 8, Plus 8 |
| sheet:type | 316 | 0 | anonymous 51, Property 24, Popover 18, Button 12, Plus 12, Bar 12 |
| edit:title | 590 | 0 | anonymous 98, Property 32, Button 26, Popover 25, Plus 21, LinkWithRef 16 |
| complete | 192 | 0 | anonymous 33, Button 14, LinkWithRef 11, NavLinkWithRef 7, Plus 6, ContextMenuTrigger 4 |
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
