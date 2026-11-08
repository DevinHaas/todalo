# Rituals: manual checks

Screenshots 01–24 cover tickets 11–14 (Check-in with ratings, planning question, Weekly and Season review). Ticket 14b reworks the Check-in and adds the Evening review and notifications; 25–29 show it. Use the test user (`test@todalo.dev`), API on port 3011, Vite on a free port (5188 here) with `CLIENT_API_PROXY_TARGET=http://127.0.0.1:3011`, `RAMBLE_ALLOWED_ORIGINS` and `AUTH_TRUSTED_ORIGINS` set to the Vite origin.

## Settings (25)
1. Settings › Rituals lists Check-in, Evening review (default 20:00), Weekly review, Season review and "Notify me when a ritual is ready" (on by default).
2. Turning on a notifying ritual asks for notification permission once (browser prompt; on Mac the system prompt).
3. Evening review on: an "Evening review" recurring item appears on today's schedule at its time (and in Google Calendar via task sync). Off removes only that item.

## Check-in plans today (28, 29)
1. `Shift+C` (or the sidebar entry, or opening the Check-in item) opens the Check-in. No ratings, no planning question.
2. Step 1 lists open tasks without a time that are overdue, due today, or undated in the Inbox, goal-linked first (goal colour dot). Each row has a time (default: next free quarter hour today), Schedule today, a due date and Leave.
3. Schedule today (`Alt+Shift+S` on the focused or first row) puts the task on today's schedule for its duration; it leaves the list and the next row's default moves past it. A due date makes it all-day on that day. Leave (`Alt+Shift+L`) hides the row for this Check-in only.
4. Next (`Alt+Shift+N`) opens Today as a calendar with the unscheduled sidebar; the panel shows "Today's schedule" with Back and Done. Done (`Alt+Shift+N`) completes the Check-in and its item moves to tomorrow.

## Evening review (26, 27)
1. `g then e` (or the sidebar entry, or the Evening review item) opens it; a toast links to settings while it is off.
2. One step per current-season goal: rating for today plus optional typed or spoken context; the last step has Finish. Skip records a skip.
3. The rating shows in the Season review history ("Sun 8 Nov: Solid") and in the Weekly review's "Daily ratings"; old Check-in ratings still show there too.

## Notifications
1. With a ritual on, its time passed today (the Weekly review only on its day) and not done or skipped, a notification "Your Evening review is ready" appears while the app is open (checked every 30 s). Only once per ritual and period, also after a reload.
2. Web: clicking it focuses the tab and opens the ritual. Mac: clicking activates todalo, and the window's next focus opens the ritual (the desktop plugin reports no click).
3. Turning "Notify me" off stops them. The browser run above used a stubbed `Notification`; nothing was sent to a real account.
