# Mac App Store submission kit

Everything to paste into App Store Connect for the Mac app (`app.todalo.client`). Field limits are in brackets; every value fits.

## Screenshots

`screenshots/01-coach.jpg` … `06-season.jpg`: 2880 × 1800 JPEG, RGB, no alpha. That is Apple's largest Mac size; App Store Connect scales it down for 2560 × 1600, 1440 × 900 and 1280 × 800. Drag them into the Mac slot **in this order**. The first three show in search results, so they carry the pitch.

| # | File | Headline | Shows |
|---|------|----------|-------|
| 1 | 01-coach | Plan your season. Let the rest flow. | The Coach drafts the week in the calendar |
| 2 | 02-setup | Start a season. Pick what matters. | Season setup with the Coach's goal suggestions |
| 3 | 03-ramble | Say it. Todalo files it. | Ramble turns speech into dated tasks |
| 4 | 04-calendar | Every goal gets its time. | The week time-blocked, Google Calendar sync |
| 5 | 05-review | Review, then steer. | Weekly review with the trajectory |
| 6 | 06-season | See where you're headed. | Season page: trajectory and goal tiers |

They are real captures of the client with demo data, not mock-ups (Guideline 2.3.3). Only the Coach's chat reply, its season-setup suggestions and Ramble's speech are stubbed, the same way the landing-page clips are.

**Re-shoot:**
1. Make a Neon branch of the `habito` project (don't seed the main branch) and an env file that is `.env` with its `DATABASE_URL`, plus `RAMBLE_PORT=3002`, `BETTER_AUTH_URL`, `AUTH_TRUSTED_ORIGINS` and `RAMBLE_ALLOWED_ORIGINS` set to `http://localhost:5173`.
2. `bun --env-file=<that env> src/index.ts` in `apps/api`, and `CLIENT_API_PROXY_TARGET=http://127.0.0.1:3002 bun run dev` in `apps/client`.
3. Create the demo user once: `TEST_USER_EMAIL=demo@todalo.dev TEST_USER_PASSWORD=demo-season-2026 TEST_USER_NAME="Alex Morgan" bun --env-file=<env> scripts/create-test-user.ts`.
4. `NODE_PATH=/tmp/landing-capture/node_modules DEMO_ENV_FILE=<env> node scripts/store-capture.cjs` writes `raw/*.png` (Playwright installed outside the repo).
5. `NODE_PATH=/tmp/landing-capture/node_modules node scripts/store-compose.cjs` writes `screenshots/`. Edit the captions in `SLIDES` there.
6. Delete the Neon branch.

App previews (video) are optional and skipped for now. The landing clips in `apps/web/public/landing/features/*.mp4` are cropped to 6:5, but a Mac preview has to be 1920 × 1080, so it needs its own capture.

## App information

| Field | Value |
|---|---|
| Name (30) | `Todalo: Season Planner` |
| Subtitle (30) | `Goals, time blocks & AI coach` |
| Primary category | Productivity |
| Secondary category | Lifestyle |
| Content rights | Doesn't contain, show or access third-party content |
| Copyright | `2026 bleat` |
| Price | Free, no in-app purchases (see "Before you submit") |
| Privacy Policy URL | `https://todalo.app/privacy` |
| Support URL | `https://help.todalo.app` once deployed, otherwise `https://todalo.app` (it must show a way to contact you; support@todalo.app) |
| Marketing URL | `https://todalo.app` |

## Version 1.0

**Promotional text (170).** Can be changed any time without review.

> Plan a season, not just a day. Set a few goals, let the Coach draft your week around them, and review on Sunday. Todalo keeps the plan, you keep the calm.

**Keywords (100).** Comma-separated, no spaces. Words already in the name and subtitle are indexed anyway, so they are left out.

```
todo,tasks,calendar,habits,productivity,focus,schedule,weekly review,voice,okr,reminders,routine
```

**Description (4000).**

```
Todalo is a planner for the next few months, not just the next few hours.

Set a season, pick the handful of goals that matter, and give each one time on your calendar. The Coach helps you plan the week, Ramble turns what you say into tasks, and a short weekly review keeps you honest. Todalo keeps the plan, you keep the calm.

SET UP YOUR SEASON
Say what the next weeks are about and how long they run. The Coach turns it into a few measurable goals, asks where you're starting from, and measures progress from there. Mark the goals that come first as Primary; the rest are Secondary.

PLAN THE WEEK WITH THE COACH
Ask in the command bar and the Coach drafts your week around your goals, primary ones first. Keep what fits, drop what doesn't, then drag any block to where you want it. Nothing changes until you accept it.

SAY IT, THEN ADD IT
Ramble everything on your mind. Todalo turns each thing into a task with its date and time, and nothing is saved until you tap Add.

TIME-BLOCK YOUR WEEK
See tasks and time blocks side by side in a week calendar. Time blocks sync with Google Calendar, so your plan and your meetings stay in step.

REVIEW, THEN STEER
Each week, see what moved, rate every goal and add a line of context. Your ratings set the season's trajectory and shape what the Coach suggests next.

EVERYTHING A TASK MANAGER NEEDS
- Today, Upcoming and Inbox, in list, board or calendar layout
- Projects, labels, filters, priorities and recurring tasks
- Natural-language quick add
- Full keyboard support
- Import your projects and tasks from Todoist in one step

BRING YOUR OWN AI
Use the Coach with your own OpenAI, Anthropic or OpenRouter key, or run it on a local model with Ollama. Your keys are encrypted at rest.

PRIVATE BY DEFAULT
We don't sell your data, show ads, or use what you plan to train AI models.

Built on ideas from Atomic Habits, Flow, Peak, The 80/20 Principle and The Power of Now. Not affiliated with the books or their authors.

Questions or ideas? support@todalo.app
```

**What's New (4000).** For the first release Apple doesn't show it; for later ones use the release notes in `apps/client/src/releases.ts`.

## App Privacy (nutrition label)

Answer **"Yes, we collect data"**. Tracking: **No** for everything (no ads, no data brokers, no cross-app tracking). Every type below is **linked to the user**.

| Data type | Purposes |
|---|---|
| Contact Info › Name | App Functionality |
| Contact Info › Email Address | App Functionality, Analytics (PostHog `identify`) |
| User Content › Audio Data | App Functionality (Ramble streams audio for transcription; not stored) |
| User Content › Other User Content | App Functionality (tasks, goals, reviews, Coach chats) |
| User Content › Customer Support | App Functionality (feedback widget, optional screenshot) |
| Identifiers › User ID | App Functionality, Analytics |
| Usage Data › Product Interaction | Analytics (PostHog) |
| Diagnostics › Crash Data | App Functionality (Sentry) |
| Diagnostics › Performance Data | App Functionality (Sentry tracing) |
| Diagnostics › Other Diagnostic Data | App Functionality (Sentry console warnings and errors) |

The privacy policy now names PostHog and Sentry too (`apps/web/app/privacy/page.tsx`, "Analytics and error reports"), so the label and the policy match. Deploy the web app before submitting.

## Age rating

Answer the questionnaire with "None" or "No" for all content. Two answers need care:
- **Unrestricted web access:** No (links open in the browser, the app has no web view for browsing).
- **AI chat / user-generated content:** the Coach is a general chat with a language model. If the questionnaire asks about AI assistants or chatbots, answer Yes. That can raise the rating above 4+, which is fine for a planner.

## App Review information

- **Sign-in required:** yes. Demo account `appreview@todalo.app` (password: the one you set when you created it; it's deliberately not stored in the repo).
- **Contact:** your name, phone and email.
- **Notes** (paste and adjust):

```
Todalo is a season and goal planner. The demo account is already set up with a season, goals and a planned week so every screen has content.

Where to look:
- Sidebar › Current season: goals, trajectory and the weekly review.
- Upcoming › Display › Calendar: the week with time blocks.
- The red button at the bottom right opens the Coach. Ask it "Plan my week around my goals".
- The waveform button next to "Add task" opens Ramble (voice capture). The microphone is only used while Ramble is open.

Google Calendar sync and Todoist import are optional and need the reviewer's own accounts; the app works fully without them.
The Coach can also run on the user's own AI provider key (OpenAI, Anthropic, OpenRouter or a local Ollama model); the demo account has a working connection.
Accounts can be deleted in Settings › Account › Delete account (with the password; Google-only accounts within a day of signing in).
There are no in-app purchases; all features are free in this version.
```

## Before you submit

These are App Review risks found while preparing this.

1. **In-app account deletion (Guideline 5.1.1(v)).** Done: Settings › Account › Delete account. Ship it in the build you submit (API and Mac app).
2. **Sign in with Apple (Guideline 4.8).** The app offers "Continue with Google". Apple asks for an equivalent privacy-friendly login next to third-party logins. Email and password sign-up usually counts, but reviewers sometimes still ask for Sign in with Apple. Be ready to add it if they do.
3. **Paid plans (Guideline 3.1.1).** The landing page sells Pro and Lifetime through Stripe. The Mac app has no paywall today, so this release is fine as Free. Once the app unlocks paid features, they must also be sold through In-App Purchase, and the app must not link to the web checkout.
4. **The demo account must work.** Before submitting, sign in as `appreview@todalo.app` in the TestFlight build (it talks to `todalo-api.bleat.ch`). Check that it has a season, goals and tasks, and that the Coach answers.
5. **Support URL.** `help.todalo.app` isn't deployed yet (help center ticket 17). Use `https://todalo.app` until it is.
