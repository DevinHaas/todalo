# 24. Prepare an installable Mac release candidate

Status: ready-for-agent
Type: task

**Blocked by:** 22.
    **What it delivers:** A signed/notarized Mac candidate installs, launches and upgrades on the declared supported architectures.
    **Acceptance:** Validate native window behavior, signing/notarization, entitlements, microphone use, environment configuration, bundled assets/CSP and API compatibility; test install/update/relaunch; document direct-distribution steps. No updater or Mac App Store expansion is required.

## Comments

Published from the approved implementation proposal on 2026-10-04. Eligibility requires every listed blocker to be complete.

2026-10-23 — Route changed: TestFlight / Mac App Store instead of Developer ID direct distribution.
- Apple setup done: Mac App Distribution + Mac Installer Distribution certificates, App ID `BS65XAQ9NH.app.todalo.client`, "Todalo Mac App Store" profile, App Store Connect record "Todalo" (Apple ID 6826214038, SKU todalo-mac).
- Build: `TODALO_API_BASE_URL=https://todalo.bleat.ch bun tauri build --bundles app --config src-tauri/tauri.appstore.conf.json --ci`, then `xcrun productbuild --sign "3rd Party Mac Developer Installer: Devin Hasler (BS65XAQ9NH)" --component <todalo.app> /Applications todalo.pkg`. Upload with Transporter or `xcrun altool --upload-app`.
- App Sandbox entitlements in `src-tauri/Entitlements.plist`. Retest Keychain sign-in, Google OAuth browser hand-off, Ramble microphone and attachment upload/download under the sandbox.
- Blocker: production runs `main`, which has no `/api/v1`; the server from this branch must be deployed before a TestFlight build can sign in.
