# Capture help center screenshots

Use the shared Vite client in `apps/client`, not the legacy Next.js client. The
capture is an opt-in authoring tool; it does not run in builds or test commands.

## Start the local client

Use an **isolated development database and API configuration**, never production.
The API still needs its normal database and Better Auth configuration. A loopback
URL alone does not prove that the API's database is a development database.

Start the API with the client origin in `AUTH_TRUSTED_ORIGINS` and
`RAMBLE_ALLOWED_ORIGINS`. For example, in separate terminals with your development
environment configured:

```sh
cd apps/api
RAMBLE_PORT=3002 AUTH_TRUSTED_ORIGINS=http://localhost:5173 RAMBLE_ALLOWED_ORIGINS=http://localhost:5173 bun run dev
```

```sh
cd apps/client
CLIENT_API_PROXY_TARGET=http://127.0.0.1:3002 bun run dev
```

The commands below run from the repository root. They reuse the landing capture's
external Playwright installation, without changing workspace dependencies or the
lockfile. If it is not installed yet:

```sh
npm install --prefix /tmp/landing-capture playwright
NODE_PATH=/tmp/landing-capture/node_modules /tmp/landing-capture/node_modules/.bin/playwright install chromium
```

Use `CHROME_PATH=/absolute/path/to/chromium` to reuse another installed Chromium
binary, as with `scripts/landing-capture.cjs`. Otherwise Playwright uses its own
installed Chromium. Keep the same browser version when refreshing related shots.

## Seed and capture

```sh
NODE_PATH=/tmp/landing-capture/node_modules node scripts/docs-capture.cjs --seed
```

This explicitly creates the synthetic `help-screenshots@todalo.invalid` account
(Alex Morgan) and adds only missing fixtures from
`scripts/help-center-demo.cjs`: four Inbox tasks, three project tasks, three
projects and three goals. The fixture password is public test data in that file,
not a credential for a real user. Do not deploy or reuse this account in production.

Unlike `scripts/seed-landing-demo.ts`, this seed **never deletes, resets or
overwrites existing tasks, projects or goals**. Existing fixture content must
match before anything is added. Reruns reuse task UUIDs and project/goal names;
an interrupted seed can resume. The only repeatable account setting write
dismisses the Todoist import prompt for this synthetic account. Do not run two
seeds concurrently; a local lock prevents overlapping captures on the same port.

The capture signs in with a fresh session, checks the account and visible-data
fixtures, and refuses unknown/edited records, duplicate names, profile images,
labels or filters. It does not use your browser profile, export a session file,
call AI features, submit the Quick add draft, or save screenshots on failure.
Non-local client origins and redirected API requests are refused; third-party
browser requests are blocked. If the fixture account has been edited, use a fresh
isolated demo database rather than resetting a real account.

For later captures, no seed writes are needed:

```sh
NODE_PATH=/tmp/landing-capture/node_modules node scripts/docs-capture.cjs
NODE_PATH=/tmp/landing-capture/node_modules node scripts/docs-capture.cjs quick-add
NODE_PATH=/tmp/landing-capture/node_modules node scripts/docs-capture.cjs --seed-only
node scripts/docs-capture.cjs --list
node --test scripts/help-center-demo.test.cjs
```

`--base-url http://localhost:5174` selects another local client. Both themes are
always captured, at 1280 × 800 CSS pixels and 2× scale, en-GB, Europe/Zurich, with
the browser clock fixed at 9 November 2026, 08:40 CET. Each shot gets a fresh page
and theme preference before the app renders. Animations and carets are suppressed;
the app's actual UI and theme tokens remain unchanged.

Outputs are tightly cropped PNG pairs:

- `apps/docs/public/screenshots/inbox-list.light.png` and `.dark.png`
- `apps/docs/public/screenshots/quick-add.light.png` and `.dark.png`

All requested shots are staged before publication. A failed authentication,
fixture check, UI step or crop leaves existing outputs untouched. The script prints
actual PNG dimensions for the themed screenshot component's `width` and `height`.
Use `/screenshots/inbox-list.light.png` and `/screenshots/inbox-list.dark.png` as
its `light` and `dark` props, together with descriptive alt text. The component
supplies the paper backdrop; do not bake a docs frame into the images.

## Add a shot

Add one entry to `SHOTS` in `scripts/docs-capture.cjs`: a unique kebab-case `name`,
client `route`, async `steps(page)`, and `crop(page)` returning one locator for the
relevant fragment. Prefer accessible roles and labels. Wait for the actual content
instead of arbitrary delays. Keep steps read-only or use unsaved drafts. Do not
complete tasks, run Coach, connect integrations, or request media permissions.

The initial examples both start in Inbox. If adding another route, replace the
Inbox-specific readiness check with that shot's own readiness step. Extend the
synthetic fixtures and guard together if more data is needed. Never allow arbitrary
account credentials or capture personal data to get past the guard.

Review each pair visually before adding it to an article. Check the crop, labels,
readability at article width, absence of loading/error states, both themes and no
real names, avatars, email, calendar events, private task text or notifications.
Use screenshots only where the text would otherwise leave a reader unsure where
to click. There are no screenshot baselines or rendering assertions.

## Capture Mac-only UI by hand

Use the same isolated fixture account on Mac. For title bars, permission prompts
and system notifications, capture once with the app **and macOS** set to light,
then again with both set to dark. Disable unrelated notifications and hide personal
menu-bar items. Permission prompts must be genuine; do not manufacture them in a
browser or change the privacy decision just for a screenshot.

Crop to the relevant fragment at the same size in both themes, omit the desktop
and unrelated windows, and save PNGs as `<name>.light.png` and `<name>.dark.png` in
`apps/docs/public/screenshots/`. Match pixel dimensions exactly, review both for
private information, then use the same themed screenshot component. Record the
Mac/app version and steps in the shot's review notes so it can be repeated.
