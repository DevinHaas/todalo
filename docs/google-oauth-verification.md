# Google OAuth verification

The app asks for Google Calendar scopes, which Google rates **sensitive**. Until the
consent screen is verified, every user sees "Google hasn't verified this app", and the
app is capped at 100 users. Calendar scopes don't need the paid security assessment
(that is only for restricted scopes such as Gmail).

- GCP project: `habito-501515` (display name "todalo"), OAuth client **todalo-prod**
  (`1089423329794-uua4v8d0iso55qpvb5b8mgmorsj1u02e.apps.googleusercontent.com`)
- Console: Google Auth Platform → Branding, Audience, Data access, Verification centre

## Checklist

| # | Step | Who | State |
|---|------|-----|-------|
| 1 | Scopes narrowed: `calendar.readonly` replaced by `calendar.calendarlist.readonly` | code | done |
| 2 | Privacy policy: Google user data section + Limited Use statement | code | done |
| 3 | Search Console: **todalo.app** and **bleat.ch** verified as Domain properties under devin.hasler@gmail.com (the project owner); TXT records in Cloudflare | agent | done 2026-11-19 |
| 4 | Branding filled in, logo uploaded, branding verified and published | agent | done 2026-11-19 |
| 5 | Data access: the five scopes below and the calendar.events justification saved | agent | done 2026-11-19 |
| 6 | Demo video recorded and uploaded to YouTube as **Unlisted** | you | |
| 7 | Verification centre → Prepare for verification: video link, submit | you | |

todalo.app is also verified under devin.hasler@powercoders.org (a second TXT record).
Keep every `google-site-verification` TXT record; removing one revokes that verification.

Authorised domains must all be verified by a project owner in Search Console. They come
from the redirect URIs: `todalo.app` (app.todalo.app) and `bleat.ch` (todalo.bleat.ch,
todalo-api.bleat.ch). Shipped Mac builds use todalo-api.bleat.ch, so bleat.ch stays.

## Branding

| Field | Value |
|---|---|
| App name | Todalo |
| User support email | support@todalo.app |
| App logo | 120×120 PNG of the Todalo mark (optional; a logo needs brand verification too) |
| Application home page | https://todalo.app |
| Privacy policy link | https://todalo.app/privacy |
| Terms of service link | https://todalo.app/terms |
| Authorised domains | todalo.app, bleat.ch |
| Developer contact | devin.hasler@gmail.com |

The app name on the consent screen must match the name on the homepage.

## Data access

Scopes (must match `packages/auth/src/index.ts` exactly; remove `calendar.readonly` if it is listed):

- `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile` (non-sensitive)
- `https://www.googleapis.com/auth/calendar.calendarlist.readonly` (non-sensitive, per the console)
- `https://www.googleapis.com/auth/calendar.events` (sensitive: the only scope under review)

### Justification: calendar.events

> Todalo is a planner for tasks and goals. Users connect Google Calendar so their
> calendar and their task schedule stay in one place. Todalo reads the events of the
> calendars the user turns on, to show them beside their tasks in the Today, Upcoming
> and calendar views and to plan tasks around them. When the user schedules a task,
> Todalo creates an event for it on their primary calendar ("time block"), updates it
> when the task moves, and deletes it when the task is unscheduled or deleted. Todalo
> registers a watch channel on those calendars so edits made in Google Calendar show
> up in Todalo. It never edits or deletes events it did not create.
> calendar.events.owned would not show events from calendars shared with the user,
> which they also plan around.

### Justification: calendar.calendarlist.readonly

> Todalo lists the user's Google calendars in Settings › Calendars so they can choose
> which calendars are shown and synced, with an eye toggle per calendar. It only reads
> the list (name, colour, id); it never adds or removes calendars.

### How the data is used (for the "Additional info" box)

> Event data is stored in Todalo's database only for the calendars the user turns on,
> to keep the sync running, and is deleted when they disconnect the account or delete
> their Todalo account. When the user asks the AI Coach to plan, the start and end times
> of their events are sent to the AI provider the user configured themselves (their own
> API key, ChatGPT account or local model), so the plan avoids busy times; event titles are included only if the user
> turns on "Share event titles with the AI" (off by default). Google user data is never
> sold, used for ads, or used to train AI models.

## Demo video (2 to 3 minutes, English, unlisted on YouTube)

Google rejects videos that don't show the consent screen with the client ID or that skip
a scope. Record in a browser at https://app.todalo.app with the address bar visible.

1. Show https://todalo.app, then the privacy policy link in the footer.
2. Open https://app.todalo.app, click **Continue with Google**.
3. On Google's screen, click the account, then **pause on the consent screen**. Click the
   address bar so the full URL shows `client_id=1089423329794-uua4v8d0iso55qpvb5b8mgmorsj1u02e...`.
   Show the app name "Todalo" and both calendar permissions, then allow.
4. **calendarlist.readonly:** open Settings › Calendars and show the list of Google
   calendars; turn one off and on with the eye toggle.
5. **calendar.events (read):** go to Today/Upcoming and show Google events next to tasks.
6. **calendar.events (write):** schedule a task for a time today, open Google Calendar in
   another tab and show the new event; move the task in Todalo and show the event move;
   unschedule it and show the event gone.
7. **Sync back:** edit the task's event in Google Calendar and show Todalo pick it up.
8. Optional: open the Coach planning flow and point out it plans around the events
   (titles off by default, Settings › Coach).
9. Settings › Calendars › **Disconnect**, to show the user can remove access.

## After submitting

Google replies by email to the developer contact, often with questions; answer in the
same thread. Typical time: a few days to a few weeks. Don't change the scopes or
branding while the review is open.
