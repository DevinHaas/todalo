# Perf run: baseline

2026-11-24T06:02:33.868Z · git 152dd40+wip · runs 5 · CPU ×1 · 412 tasks

## Scenarios (ms, input → first frame after the change; loads from navigation start)

| scenario | p50 | p95 | INP | TBT | extra |
|---|---|---|---|---|---|
| load:cold | 2774 | 2799 | – | 20.0 | fcp 56.0, lcp 176, ttfb 1.3, jsKB 803, apiCount 15.0, domNodes 3720 |
| load:warm | 2441 | 2869 | – | 15.0 | fcp 84.0, lcp 84.0, ttfb 1.3, jsKB 1.0, apiCount 12.0, domNodes 3720 |
| tab:inbox (first) | 278 | 287 | 32.0 | 139 |  |
| tab:today (first) | 90.5 | 93.4 | 32.0 | 0.0 |  |
| tab:upcoming (first) | 459 | 517 | 32.0 | 172 |  |
| tab:inbox | 170 | 174 | 32.0 | 42.0 |  |
| tab:today | 84.9 | 98.5 | 32.0 | 0.0 |  |
| tab:upcoming | 337 | 398 | 32.0 | 163 |  |
| sheet:open | 114 | 131 | 112 | 27.0 |  |
| sheet:type | 46.1 | 49.9 | 32.0 | 0.0 |  |
| edit:title | 87.6 | 97.3 | 32.0 | 0.0 |  |
| complete | 113 | 126 | 32.0 | 0.0 | server 1367 |
| composer:open | 20.3 | 20.6 | 0.0 | 0.0 |  |
| composer:type40 | 61.3 | 61.7 | 32.0 | 0.0 | perKey 1.5 |
| composer:add | 96.3 | 98.2 | 32.0 | 0.0 |  |
| scroll:today | 18.3 | 18.4 | – | – | janky 1.0, max 54.5 |
| quickadd:open | 127 | 129 | 0.0 | 71.0 |  |
| quickadd:add | 177 | 181 | 40.0 | 30.0 | savedAt 2435 |
| upcoming:cold | 2929 | 2946 | – | – | apiCount 16.0, domNodes 11529 |
| upcoming:warm | 3021 | 3085 | – | – | apiCount 16.0, domNodes 11511 |
| scroll:upcoming | 38.9 | 45.9 | – | – | janky 8.0, max 73.6 |
| sync:other-device | 2862 | 2873 | – | – |  |

Cold load API waterfall (start→end ms): /api/v1/account 145→927, /api/v1/settings/keyboard 964→1554, /api/v1/rituals 965→1559, /api/v1/goals 965→1983, /api/v1/metadata 966→1957, /api/v1/projects 966→1961, /api/v1/coach 966→2550, /api/v1/today 967→2729, /api/v1/calendar/events 967→2566, /api/v1/settings/personalization 970→2545, /api/v1/settings 977→2580

## React renders per interaction (React Scan, scan build, worst pass)

| scenario | renders | unnecessary | top components |
|---|---|---|---|
| tab:inbox (first) | 8311 | 0 | anonymous 2410, LinkWithRef 842, X 824, Inbox 822, TaskRow 820, PendingAttachments 820 |
| tab:today (first) | 4098 | 0 | anonymous 1009, LinkWithRef 501, Inbox 491, X 491, TaskRow 490, PendingAttachments 490 |
| tab:upcoming (first) | 9415 | 0 | anonymous 2860, Plus 742, Composer 734, LinkWithRef 712, Inbox 692, CalendarDays 692 |
| tab:inbox | 17263 | 0 | anonymous 5183, LinkWithRef 1521, Inbox 1511, X 1511, TaskRow 1510, PendingAttachments 1510 |
| tab:today | 4239 | 0 | anonymous 1036, LinkWithRef 512, Inbox 492, X 492, TaskRow 490, PendingAttachments 490 |
| tab:upcoming | 9420 | 0 | anonymous 2862, Plus 742, Composer 734, LinkWithRef 712, X 693, Inbox 692 |
| sheet:open | 6233 | 0 | anonymous 1521, Inbox 741, LinkWithRef 738, PendingAttachments 738, X 738, TaskRow 735 |
| sheet:type | 204 | 0 | anonymous 34, Property 16, Popover 12, Button 8, Plus 8, Bar$1 8 |
| edit:title | 4394 | 0 | anonymous 1059, LinkWithRef 504, Inbox 497, X 494, PendingAttachments 493, TaskRow 490 |
| complete | 4081 | 0 | anonymous 1005, LinkWithRef 499, Inbox 489, X 489, TaskRow 488, PendingAttachments 488 |
| composer:open | 39 | 0 | anonymous 10, Popover 5, ContextMenuTrigger 3, MenuRoot 2, FloatingTree 2, Dropdown 2 |
| composer:type40 | 1160 | 0 | anonymous 400, Popover 200, Dropdown 80, Composer 40, Plus 40, Calendar1 40 |
| composer:add | 4197 | 0 | anonymous 1047, LinkWithRef 505, X 495, Inbox 495, TaskRow 490, PendingAttachments 490 |
| quickadd:open | 4203 | 0 | anonymous 1221, LinkWithRef 424, Inbox 414, X 414, TaskRow 411, PendingAttachments 411 |
| quickadd:add | 8281 | 0 | anonymous 2420, LinkWithRef 839, Inbox 829, X 829, TaskRow 824, PendingAttachments 824 |

## API routes (direct to the API, p50/p95 ms over 10 calls; body KB raw / gzip / brotli; served encoding)

| route | p50 | p95 | KB | gzip | br | served |
|---|---|---|---|---|---|---|
| /api/v1/account | 784 | 849 | 0.2 | 0.2 | 0.2 | none |
| /api/v1/calendar/events | 597 | 599 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/coach | 789 | 810 | 0.2 | 0.2 | 0.1 | none |
| /api/v1/coach/chat | 589 | 594 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/coach/drafts?timeZone=Europe%2FZurich | 585 | 588 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/goal-links | 587 | 589 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/goals | 592 | 593 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/imports/todoist?timeZone=Europe%2FZurich | 588 | 590 | 0.0 | 0.1 | 0.0 | none |
| /api/v1/metadata | 590 | 593 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/projects | 590 | 663 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/rituals?timeZone=Europe%2FZurich | 600 | 606 | 0.5 | 0.2 | 0.2 | none |
| /api/v1/seasons/current?timeZone=Europe%2FZurich | 594 | 598 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/seasons/past | 595 | 596 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/settings | 592 | 593 | 0.1 | 0.1 | 0.1 | none |
| /api/v1/settings/keyboard | 589 | 592 | 0.1 | 0.1 | 0.1 | none |
| /api/v1/settings/personalization | 589 | 589 | 0.0 | 0.0 | 0.0 | none |
| /api/v1/sync | 589 | 589 | 0.2 | 0.1 | 0.1 | none |
| /api/v1/today | 987 | 1171 | 170 | 15.2 | 11.4 | none |

## Bundle (prod build)

Initial JS 2716 KB (811 gz) · initial CSS 371 KB (54.1 gz) · all JS 2738 KB in 2 chunks

- index-BY_TgCjG.js 2716KB (811 gz)
- index-DG5PvS7E.css 371KB (54 gz)
- dist-BoHMOFax.js 22KB (8 gz)
