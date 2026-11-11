# 03. Platform choice, switcher and platform-aware components

Status: ready-for-agent
Type: task

**Blocked by:** 01.

Spec: `.scratch/help-center/spec.md` (Platform switcher, Testing Decisions).

**What it delivers:** Pure platform-choice logic (default from reported OS, stored choice wins, whether an article needs the switcher, which modifier keys to show), the remembered Web / Mac switcher, a platform-specific MDX block that keeps hidden variants in the page source, and a keyboard-key component. The platform model accepts a third platform (iOS) without article changes.

**Acceptance:** The pure functions are unit tested as listed in Testing Decisions. The choice persists across pages and reloads with no flash of the wrong platform on load.

## Comments
