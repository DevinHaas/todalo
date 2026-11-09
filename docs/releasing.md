# Releasing

1. **Bump the version** in all three places, to the same value:
   - `apps/client/package.json` → `"version"`
   - `apps/client/src-tauri/tauri.conf.json` → `"version"`
   - `apps/client/src-tauri/Cargo.toml` → `version` under `[package]`
2. **Add release notes** at the top of `releases` in `apps/client/src/releases.ts`:
   `{ version, date, title?, highlights, changes? }`. Keep highlights short and user-facing;
   they appear in What's new (latest only) and the Changelog (all). Update `experiments`
   in the same file if an experimental feature graduated or a new one arrived.
3. **Run the tests**: `cd apps/client && bun run test && bun run typecheck`.
   `releases.test.ts` fails if the three versions disagree or the newest entry isn't the new version.

After the update, each user sees What's new once (the last seen version is kept per user in localStorage).
