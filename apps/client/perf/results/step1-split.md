# Perf run: step1-split

2026-11-24T06:09:00.116Z · git 152dd40+wip · runs 3 · CPU ×1 · 408 tasks

## Scenarios (ms, input → first frame after the change; loads from navigation start)

| scenario | p50 | p95 | base p50 | Δ | INP | TBT | extra |
|---|---|---|---|---|---|---|---|
| load:cold | 2728 | 2746 | 2774 | -2% | – | 19.0 | fcp 124, lcp 124, ttfb 1.3, jsKB 528, apiCount 15.0, domNodes 3736 |
| load:warm | 2464 | 2709 | 2441 | 1% | – | 13.0 | fcp 88.0, lcp 88.0, ttfb 1.1, jsKB 1.0, apiCount 12.0, domNodes 3744 |
| tab:inbox (first) | 271 | 273 | 278 | -2% | 32.0 | 132 |  |
| tab:today (first) | 89.9 | 91.2 | 90.5 | -1% | 32.0 | 0.0 |  |
| tab:upcoming (first) | 448 | 515 | 459 | -3% | 32.0 | 169 |  |
| tab:inbox | 176 | 197 | 170 | 4% | 32.0 | 45.0 |  |
| tab:today | 107 | 119 | 84.9 | 26% | 32.0 | 0.0 |  |
| tab:upcoming | 332 | 346 | 337 | -1% | 32.0 | 113 |  |
| sheet:open | 117 | 117 | 114 | 2% | 112 | 28.0 |  |
| sheet:type | 42.7 | 47.3 | 46.1 | -7% | 32.0 | 0.0 |  |
| edit:title | 89.1 | 89.4 | 87.6 | 2% | 32.0 | 0.0 |  |
| complete | 115 | 120 | 113 | 2% | 32.0 | 0.0 | server 1372 |
| composer:open | 20.3 | 21.0 | 20.3 | 0% | 0.0 | 0.0 |  |
| composer:type40 | 61.9 | 62.5 | 61.3 | 1% | 32.0 | 0.0 | perKey 1.5 |
| composer:add | 96.5 | 97.9 | 96.3 | 0% | 32.0 | 0.0 |  |
| scroll:today | 18.0 | 18.3 | 18.3 | -2% | – | – | janky 1.0, max 58.0 |
| quickadd:open | 127 | 128 | 127 | 0% | 0.0 | 71.0 |  |
| quickadd:add | 178 | 180 | 177 | 1% | 40.0 | 29.0 | savedAt 2438 |
| upcoming:cold | 2309 | 2869 | 2929 | -21% | – | – | apiCount 12.0, domNodes 11557 |
| upcoming:warm | 3113 | 3306 | 3021 | 3% | – | – | apiCount 16.0, domNodes 11557 |
| scroll:upcoming | 31.4 | 34.2 | 38.9 | -19% | – | – | janky 8.0, max 78.0 |
| sync:other-device | 2905 | 3000 | 2862 | 1% | – | – |  |

Cold load API waterfall (start→end ms): /api/v1/account 92→876, /api/v1/settings/keyboard 911→1502, /api/v1/rituals 912→1520, /api/v1/goals 912→1913, /api/v1/metadata 913→1918, /api/v1/projects 913→1917, /api/v1/coach 913→2527, /api/v1/today 913→2673, /api/v1/calendar/events 914→2117, /api/v1/settings/personalization 916→2519, /api/v1/imports/todoist 918→2517, /api/v1/settings 918→2517

## React renders per interaction (React Scan, scan build, worst pass)

| scenario | renders | unnecessary | top components |
|---|---|---|---|
| tab:inbox (first) | 12327 | 0 | anonymous 3400, LinkWithRef 1336, Inbox 1309, X 1309, TaskRow 1306, PendingAttachments 1306 |
| tab:today (first) | 6128 | 0 | anonymous 1512, LinkWithRef 752, Inbox 742, X 742, TaskRow 741, PendingAttachments 741 |
| tab:upcoming (first) | 9323 | 0 | anonymous 2847, Plus 738, Composer 734, LinkWithRef 705, X 696, Inbox 695 |
| tab:inbox | 12047 | 0 | anonymous 3526, LinkWithRef 1229, X 1220, Inbox 1219, TaskRow 1218, PendingAttachments 1218 |
| tab:today | 4271 | 0 | anonymous 1044, LinkWithRef 516, Inbox 496, X 496, TaskRow 494, PendingAttachments 494 |
| tab:upcoming | 9302 | 0 | anonymous 2844, Plus 738, Composer 734, LinkWithRef 705, Inbox 695, CalendarDays 695 |
| sheet:open | 8309 | 0 | anonymous 2034, Inbox 994, LinkWithRef 993, X 992, PendingAttachments 991, TaskRow 988 |
| sheet:type | 204 | 0 | anonymous 34, Property 16, Popover 12, Button 8, Plus 8, Bar 8 |
| edit:title | 4426 | 0 | anonymous 1067, LinkWithRef 508, Inbox 501, X 498, PendingAttachments 497, TaskRow 494 |
| complete | 4113 | 0 | anonymous 1013, LinkWithRef 503, Inbox 493, X 493, TaskRow 492, PendingAttachments 492 |
| composer:open | 39 | 0 | anonymous 10, Popover 5, ContextMenuTrigger 3, MenuRoot 2, FloatingTree 2, Dropdown 2 |
| composer:type40 | 1160 | 0 | anonymous 400, Popover 200, Dropdown 80, Composer 40, Plus 40, Calendar1 40 |
| composer:add | 4229 | 0 | anonymous 1055, LinkWithRef 509, X 499, Inbox 499, TaskRow 494, PendingAttachments 494 |
| quickadd:open | 4167 | 0 | anonymous 1211, LinkWithRef 420, Inbox 410, X 410, TaskRow 407, PendingAttachments 407 |
| quickadd:add | 8209 | 0 | anonymous 2400, LinkWithRef 831, Inbox 821, X 821, TaskRow 816, PendingAttachments 816 |

## API routes (direct to the API: DB queries per request, p50/p95 ms over 10 calls; body KB raw / gzip / brotli; served encoding)

| route | queries | p50 | p95 | KB | gzip | br | served |
|---|---|---|---|---|---|---|---|
| /api/v1/account | 4 | 788 | 789 | 0.2 | 0.2 | 0.2 | none |
| /api/v1/calendar/events | 5 | 592 | 667 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/coach | 7 | 787 | 790 | 0.2 | 0.2 | 0.1 | none |
| /api/v1/coach/chat | 4 | 589 | 591 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/coach/drafts?timeZone=Europe%2FZurich | 3 | 588 | 591 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/goal-links | 4 | 590 | 594 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/goals | 4 | 591 | 593 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/imports/todoist?timeZone=Europe%2FZurich | 3 | 587 | 594 | 0.0 | 0.1 | 0.0 | none |
| /api/v1/metadata | 5 | 587 | 590 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/projects | 3 | 588 | 595 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/rituals?timeZone=Europe%2FZurich | 3 | 590 | 593 | 0.5 | 0.2 | 0.2 | none |
| /api/v1/seasons/current?timeZone=Europe%2FZurich | 3 | 588 | 589 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/seasons/past | 7 | 588 | 592 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/settings | 3 | 587 | 590 | 0.1 | 0.1 | 0.1 | none |
| /api/v1/settings/keyboard | 3 | 589 | 596 | 0.1 | 0.1 | 0.1 | none |
| /api/v1/settings/personalization | 3 | 586 | 590 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/sync | 5 | 587 | 590 | 0.2 | 0.1 | 0.1 | none |
| /api/v1/today | 4 | 984 | 987 | 168 | 15.0 | 11.2 | none |
| POST /api/v1/tasks | 10 | 1577 | 1577 | – | – | – | undefined |
| PATCH /api/v1/tasks/:id | 11 | 1572 | 1581 | – | – | – | undefined |
| POST /api/v1/tasks/:id/complete | 9 | 1378 | 1388 | – | – | – | undefined |
| DELETE /api/v1/tasks/:id | 6 | 790 | 797 | – | – | – | undefined |

## Bundle (prod build)

Initial JS 1735 KB (531 gz) · initial CSS 368 KB (53.2 gz) · all JS 2409 KB in 8 chunks

- bulk-views-B1e0o3Dr.js 933KB (279 gz)
- index-hPjC23R4.js 800KB (251 gz)
- settings-dialog-BCbaWUX6.js 590KB (153 gz)
- index-D6GBG_Ky.css 368KB (53 gz)
- dist-BY9j4ReK.js 49KB (16 gz)
- dist-BoHMOFax.js 22KB (8 gz)
