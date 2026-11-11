# 14. Link the app to the help center

Status: ready-for-agent
Type: task

**Blocked by:** None.

Spec: `.scratch/help-center/spec.md` (Changes outside the docs application).

**What it delivers:** In the client, "Help & resources" opens `https://help.todalo.app` in the browser (system browser on Mac); the keyboard-shortcut sheet stays reachable by its shortcut and its own menu entry. In-app strings that promise a help link point to the matching article address. The privacy and terms pages use `support@todalo.app`.

**Acceptance:** Existing client tests pass; the help URL lives in one place. Check the Tauri capability and CSP rules allow opening the external URL.

## Comments
