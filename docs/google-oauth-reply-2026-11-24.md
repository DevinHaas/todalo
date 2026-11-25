# Reply to Google OAuth verification checklist (2026-11-24)

Reply in the same thread, from devin.hasler@gmail.com. Send only after the privacy
policy change is deployed to https://todalo.app/privacy.

---

Subject: Re: OAuth verification – habito-501515 (Todalo) – audit done, one question

Hello Third Party Data Safety Team,

Thank you for the checklist. I went through it item by item for Todalo (project
habito-501515, project number 1089423329794). Below is what Todalo does, what I changed
after the audit, and one question where I'd like your guidance.

**About Todalo**
Todalo is a personal planner for tasks and goals. Users connect Google Calendar so their
events and their task schedule live in one place. It uses no Gmail, Drive, Photos,
YouTube, Chat, Meet, Health or Data Portability APIs, and no restricted scopes.

**Scopes and why we need them**
- openid, userinfo.email, userinfo.profile: sign-in.
- calendar.calendarlist.readonly: lists the user's calendars in Settings › Calendars so
  they choose which ones Todalo shows and syncs. Read only.
- calendar.events: reads the events of the calendars the user turns on, to show them
  beside their tasks and plan around them; creates, updates and deletes an event on the
  primary calendar when the user schedules, moves or unschedules a task; registers a watch
  channel so edits made in Google Calendar sync back. Todalo never changes events it did
  not create.

Narrower scopes don't cover this: calendar.events.readonly cannot create the task events,
calendar.events.owned does not return events from calendars shared with the user (which
they also plan around), and calendar.app.created cannot read existing events. All scopes
back production features, and the scopes in the console match what the app requests.

**Demo video**
Unlisted: https://youtu.be/F60HHOYBzaU. It shows the consent screen with the client ID
and every scope, the calendar list, events in the app, and an event being created, moved
and deleted from Todalo with each change visible in Google Calendar, then sync back from
Google Calendar and Disconnect.

**Testing access**
No test account is needed: open https://app.todalo.app, click "Continue with Google" and
use any Google account. There is no phone verification and no payment. Calendar features:
Settings › Calendars (connect and choose calendars), Today and Upcoming (events beside
tasks), and giving any task a date and time (creates its calendar event).

**What I changed after the audit**
1. Privacy policy (https://todalo.app/privacy, section "Google user data"): it now states
   in separate paragraphs what Google data is accessed, how it is used, who it is shared
   with, how it is protected (TLS in transit, encrypted at rest, no human access except
   for support at the user's request, security or legal reasons), and how long it is kept
   (only while the calendar is connected; deleted on Disconnect or account deletion). It
   also carries the affirmative statement: "The use of raw or derived user data received
   from Google Workspace APIs will adhere to the Google User Data Policy, including the
   Limited Use requirements."
2. OpenRouter: Coach requests sent through OpenRouter are now restricted to endpoints that
   do not train on the data (data_collection: deny).
3. ChatGPT: users who run the Coach on their own ChatGPT plan now see a notice where they
   sign in, telling them to turn off "Improve the model for everyone" so OpenAI does not
   train on their event times. The privacy policy says the same.

**How Google data reaches AI (and our question)**
Todalo itself never uses Google data to develop, improve or train any AI/ML model, and
never sells it or uses it for ads. Todalo has an optional AI "Coach". When the user asks
it to plan their week, the start and end times of their events are sent to the AI
provider the user configured with their own credentials, so the plan doesn't overlap
their meetings. Event titles are only included if the user turns that on (off by default).
The provider can be:
- OpenAI API or Anthropic API with the user's own key: these providers do not train on
  API data by default.
- OpenRouter: restricted to non-training endpoints, as above.
- A local model through Ollama: nothing leaves the user's machine.
- The user's own ChatGPT plan (signed in with their ChatGPT account): for personal plans,
  OpenAI's training depends on the user's own "Improve the model for everyone" setting,
  which Todalo cannot turn off for them. We show the notice described above.

Our question: is the ChatGPT case acceptable with this notice? If not, which option would
you prefer?
a) Keep sending event times for ChatGPT plans, with the notice (current state).
b) For ChatGPT plans, send no calendar data to the model and resolve overlaps with events
   on our side instead.
c) Disable the calendar-aware planning for ChatGPT plans entirely.
We are happy to implement b) or c) if that is what's needed for approval.

Please let me know if anything else is missing.

Best regards,
Devin Hasler
Todalo
support@todalo.app
