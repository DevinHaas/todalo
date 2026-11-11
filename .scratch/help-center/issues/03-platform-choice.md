# 03. Platform choice, switcher and platform-aware components

Status: resolved
Type: task

**Blocked by:** 01.

Spec: `.scratch/help-center/spec.md` (Platform switcher, Testing Decisions).

**What it delivers:** Pure platform-choice logic (default from reported OS, stored choice wins, whether an article needs the switcher, which modifier keys to show), the remembered Web / Mac switcher, a platform-specific MDX block that keeps hidden variants in the page source, and a keyboard-key component. The platform model accepts a third platform (iOS) without article changes.

**Acceptance:** The pure functions are unit tested as listed in Testing Decisions. The choice persists across pages and reloads with no flash of the wrong platform on load.

## Comments

Implemented 2026-11-11 in the shared root checkout. Recovered the interrupted
agent's untracked `lib/platform.ts` and `lib/platform.test.ts` from
`/Users/devinhasler/.t3/worktrees/todalo/t3-818d9073/apps/docs`, then completed
the missing block detection, bootstrap and components.

Exports and integration contract for ticket 04:

- `components/platform-provider.tsx`: `PlatformProvider({ children: ReactNode })`
  and `usePlatform(): { platform: Platform; setPlatform(platform: Platform): void }`.
  Mount one provider inside the root layout's body, surrounding all pages. It
  emits the platform CSS and synchronous bootstrap script before its children.
  Keep the existing `suppressHydrationWarning` on `<html>`: bootstrap sets
  `data-platform` and `data-key-style` there. CSS selects the content, keys and
  active switcher button before hydration; the React subscription keeps the
  initial server snapshot stable. The bootstrap preserves an existing choice
  when remounted, including when browser storage is blocked.
- `components/platform-switcher.tsx`:
  `PlatformSwitcher({ hasPlatformContent: boolean, className?: string })`.
  Pass the article's block-detection result; `false` renders nothing. The Web
  and Mac controls are native keyboard-operable toggle buttons with an
  accessible group label, pressed state and visible focus outline.
- `components/platform-content.tsx`:
  `PlatformContent({ on: Platform, children: ReactNode, className?: string })`;
  also exported as `Platform` for `<Platform on="mac">` MDX. All variants stay
  in the HTML; CSS hides only non-selected variants. No conditional React
  rendering removes article content.
- `components/keyboard-shortcut.tsx`:
  `Shortcut({ keys: string, className?: string })`, also exported as `Kbd`.
  Example: `<Shortcut keys="Mod+Shift+C" />`. Both modifier styles are in the
  HTML; the selected platform and actual operating system determine which is
  visible. Mac symbols also carry spoken modifier names for assistive tools.
- `components/themed-screenshot.tsx`:
  `ThemedScreenshot({ light: string, dark: string, alt: string, width: number,
  height: number, caption?: ReactNode, className?: string })`. Pass the paired
  screenshot paths and their intrinsic dimensions. The existing root `dark`
  class selects the matching image, without client effects or hydration flash.
  It uses the docs application's paper/ink tokens and rounded backdrop.
- `lib/platform.ts`: `Platform = "web" | "mac"`, `KeyStyle = "mac" | "ctrl"`,
  `PLATFORMS`, `PLATFORM_LABELS`, `PLATFORM_KEY = "todalo-help-platform"`,
  `isPlatform(value: unknown)`, `isMacOS(reportedOs: string)`,
  `defaultPlatform(reportedOs: string)`,
  `resolvePlatform(stored: string | null, reportedOs: string)`,
  `keyStyle(platform: Platform, reportedOs: string)`,
  `keyLabel(keys: string, style: KeyStyle)`, and
  `needsPlatformSwitcher(source: string)`. The detector accepts both MDX block
  names and ignores fenced examples, inline code, comments and frontmatter.
  `platformScript` and `platformStyles` are also exported if the layout owner
  wants to emit them in `<head>`; the provider already includes them.

The choice is global under `localStorage[PLATFORM_KEY]`, with live updates to
other mounted controls and other tabs. Storage-denied browsers still retain
the choice across client navigation, but cannot persist it through a reload.
Add iOS later by extending `PLATFORMS` and `PLATFORM_LABELS`; bootstrap
validation, the switcher and generated CSS derive from the shared list, so
existing articles need no restructuring.

Validation: `bun run test apps/docs/lib/platform.test.ts apps/docs/lib/theme.test.ts`
passes (29 tests); scoped TypeScript and ESLint checks over all recovered/new
platform, keyboard and screenshot files pass. The first full
`bun run --filter @todalo/docs typecheck` passed; the final repeat encountered
concurrent ticket-02 work: `lib/content.test.ts(5,29): TS2307: Cannot find module
'./content'`. That unrelated content module is outside this ticket's ownership.
Tests
cover defaults, stored overrides, the full OS/platform modifier matrix, block
detection, and executing the actual pre-paint script with modern/legacy OS
reports, invalid storage, denied storage and a remounted provider.

No routes, layout, global CSS or content module were changed. Ticket 04 owns
wiring the provider, the switcher flag and the MDX component map. No browser
review or screenshot generation was performed, as requested.
