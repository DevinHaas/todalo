# 14. Link the app to the help center

Status: resolved
Type: task

**Blocked by:** None.

Spec: `.scratch/help-center/spec.md` (Changes outside the docs application).

**What it delivers:** In the client, "Help & resources" opens `https://help.todalo.app` in the browser (system browser on Mac); the keyboard-shortcut sheet stays reachable by its shortcut and its own menu entry. In-app strings that promise a help link point to the matching article address. The privacy and terms pages use `support@todalo.app`.

**Acceptance:** Existing client tests pass; the help URL lives in one place. Check the Tauri capability and CSP rules allow opening the external URL.

## Comments

### 2026-11-11 (agent, branch `help-center-14-client-link`)

What changed:

- `apps/client/src/help-links.json` is the one place for help addresses: the base `https://help.todalo.app` and a named list of article paths (today only `google-calendar` → `/integrations/use-google-calendar-with-todalo`). `apps/client/src/help.ts` (`helpLink(article?)`) builds anchor props from it, and the Mac app embeds the same file.
- Sidebar "Help & resources" is now a link to the help center home (new tab in the browser).
- The shortcut sheet keeps `?` and `o then h`, and gets its own entry, "Keyboard shortcuts", in the account menu (above "Send feedback").
- Settings › Calendars: "Find out how to show events from multiple accounts." is now a link to the Google Calendar article.
- New native command `open_help` (`src-tauri/src/help.rs`), listed in `build.rs`, `lib.rs` and `capabilities/default.json`. The webview passes an article name or nothing, never a URL; Rust looks the name up in the embedded list and opens the system browser. Unknown names are refused.
- Privacy and terms pages use `support@todalo.app`.
- Capability and CSP check: the webview still has no opener permission; only `allow-open-help` was added. No CSP change, because opening the system browser from Rust is not a webview request.

Deviations and open points:

- The article address is provisional (category and article slugs are not fixed). Correct it in `help-links.json` when ticket 12 settles the slug.
- The help center is not deployed, so both links lead nowhere until ticket 17.
- The legacy web app's "Help & resources" (`apps/web/components/app-sidebar.tsx`) is unchanged, as the spec leaves that app alone.
- Tests: `apps/client/src/help.test.ts` and Rust unit tests in `help.rs`. The sidebar link and the new account-menu entry have no render test (the shell has none), and nothing was run inside the real Mac app.

### 2026-11-11 (agent, branch `help-center-review-fixes`)

The Settings › Calendars hint now links to the help center home, because the Google Calendar article is unpublished and would 404. Its address is parked under `unpublished` in `apps/client/src/help-links.json`. **When the Integrations category is published:** move `google-calendar` back under `articles`, change `helpLink()` in `apps/client/src/calendar-views.tsx` to `helpLink("google-calendar")`, and restore the article expectations in `apps/client/src/help.test.ts` and `src-tauri/src/help.rs`.
