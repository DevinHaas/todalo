# Perf run: step9-settle

2026-11-24T07:05:59.734Z · git 152dd40+wip · runs 3 · CPU ×1 · 408 tasks

## Scenarios (ms, input → first frame after the change; loads from navigation start)

| scenario | p50 | p95 | base p50 | Δ | INP | TBT | extra |
|---|---|---|---|---|---|---|---|
| sheet:open | 57.2 | 59.0 | 57.3 | -0% | 0.0 | 0.0 |  |
| sheet:type | 24.0 | 24.5 | 23.4 | 3% | 0.0 | 0.0 |  |
| edit:title | 31.7 | 32.4 | 31.8 | -0% | 0.0 | 0.0 |  |
| complete | 32.3 | 33.8 | 32.8 | -2% | 16.0 | 0.0 | server 655 |
| composer:open | 15.4 | 17.9 | 16.8 | -8% | 0.0 | 0.0 |  |
| composer:type40 | 48.7 | 50.2 | 63.3 | -23% | 32.0 | 0.0 | perKey 1.2 |
| composer:add | 32.6 | 32.7 | 33.9 | -4% | 0.0 | 0.0 |  |
| scroll:today | 18.1 | 18.1 | 18.2 | -1% | – | – | janky 0.0, max 18.6 |
| quickadd:open | 17.7 | 17.8 | 18.1 | -2% | 0.0 | 0.0 |  |
| quickadd:add | 31.6 | 34.1 | 38.2 | -17% | 0.0 | 0.0 | savedAt 233 |
| sync:other-device | 420 | 428 | 421 | -0% | – | – |  |

## React renders per interaction (React Scan, scan build, worst pass)

| scenario | renders | unnecessary | top components |
|---|---|---|---|
| sheet:open | 1230 | 0 | TaskRow 494, PendingSubtaskRows 494, anonymous 34, Property 16, Popover 12, Button 10 |
| sheet:type | 204 | 0 | anonymous 34, Property 16, Popover 12, Button 8, Plus 8, Bar 8 |
| edit:title | 1469 | 0 | TaskRow 494, PendingSubtaskRows 494, anonymous 81, Property 24, Button 22, Popover 19 |
| complete | 1167 | 0 | TaskRow 492, PendingSubtaskRows 492, anonymous 31, LinkWithRef 11, Button 10, NavLinkWithRef 7 |
| composer:open | 39 | 0 | anonymous 10, Popover 5, ContextMenuTrigger 3, MenuRoot 2, FloatingTree 2, Dropdown 2 |
| composer:type40 | 1160 | 0 | anonymous 400, Popover 200, Dropdown 80, Composer 40, Plus 40, Calendar1 40 |
| composer:add | 1272 | 0 | TaskRow 494, PendingSubtaskRows 494, anonymous 69, Popover 21, LinkWithRef 16, Button 10 |
| quickadd:open | 1017 | 0 | TaskRow 407, PendingSubtaskRows 407, anonymous 43, LinkWithRef 13, Popover 11, Button 10 |
| quickadd:add | 1081 | 0 | TaskRow 408, PendingSubtaskRows 408, anonymous 62, Popover 21, LinkWithRef 16, Button 12 |

## API routes (direct to the API: DB queries per request, p50/p95 ms over 10 calls; body KB raw / gzip / brotli; served encoding)

| route | queries | p50 | p95 | KB | gzip | br | served |
|---|---|---|---|---|---|---|---|

## Bundle (prod build)

Initial JS 1742 KB (534 gz) · initial CSS 368 KB (53.2 gz) · all JS 2417 KB in 8 chunks

- bulk-views-CHAVA8IB.js 934KB (279 gz)
- index-CFDqfVYb.js 806KB (253 gz)
- settings-dialog-dOt9eXEd.js 590KB (153 gz)
- index-CcIYMc-f.css 368KB (53 gz)
- dist-BY9j4ReK.js 49KB (16 gz)
- dist-BoHMOFax.js 22KB (8 gz)
