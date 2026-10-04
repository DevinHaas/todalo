# Tauri migration progress — 4 October 2026

Branch: `codex/tauri-migration`.
Isolated workspace: `/Users/devinhasler/.codex/worktrees/tauri-migration/todalo`.
Starting commit: `e6b21cb245574d50ce78fca1c59da97610c142f8`.

The source checkout remains on its existing branch. Its untracked research files and `scripts/loop.sh` were left in place. The migration specification and proposal were copied into this worktree and committed with 28 individual tickets in `.scratch/tauri-migration/issues/`.

## Execution

Each implementation ticket has its own agent. Ticket 1 owns the shared Today query, regression coverage, deterministic visual baseline and capability inventory. Ticket 2 has a separate agent for the Vite/Tauri shell, account flow and native authentication preparation. It waits for ticket 1 acceptance before implementation. Later tickets remain subject to their recorded blockers; signed hardware validation and the native feasibility gate are required before broad migration.

## Initial validation

- Isolated dependencies: `bun install --frozen-lockfile --ignore-scripts` succeeded.
- Pre-change tests after dependency setup: 27 files, 281 tests passed.
- Pre-change `bun run typecheck`: all five workspaces passed.
- Pre-change API build: passed.
- The initial dependency symlink caused eight test-file resolution failures for `@todalo/ramble`; installing independent workspace dependencies resolved them. These were setup failures, not application regressions.

## Apple environment

- Xcode: 26.0.1, build 17A400.
- Rust: cargo 1.99.0; installed target `aarch64-apple-darwin`.
- `security find-identity -v -p codesigning`: zero valid signing identities.
- `xcrun devicectl list devices`: timed out initializing CoreDeviceService; no physical-device availability is established.
- The user confirmed that no Apple Developer membership exists yet and requested enrollment/subscription guidance. Follow [the enrollment guide](apple-developer-enrollment.md); entity type, team, final bundle identifier and physical iPhone availability remain open. Do not infer successful hardware validation from an unsigned build or simulator.

The migration cannot be declared release-ready until the specified signing, physical-device, lifecycle and parity checks are evidenced. Production routing and external publication remain separate release actions.
