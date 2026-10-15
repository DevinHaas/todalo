# 12. Use smart quick-add and save date-recognition preferences

Status: in-progress (code-complete; iOS software keyboard, native shells and physical devices pending)
Type: task

**Blocked by:** 11.
    **What it delivers:** Natural-language quick-add and its highlighting/date recognition work as today, and the setting survives restart/account reload.
    **Acceptance:** Reuse parsing and highlighting decisions from existing ADRs; preserve detected and overridden dates/recurrence; provide a working settings control and failure recovery; verify keyboard and touch entry.

## Comments

Published from the approved implementation proposal on 2026-10-04. Eligibility requires every listed blocker to be complete.

2026-10-15 — implemented. Evidence: `docs/qa/tauri-quick-add.md` (+ `docs/qa/tauri-quick-add/`);
conventions: `apps/client/README.md` ("Smart quick add and settings").

Verified:
- Parser and field sync shared, not copied: `@todalo/ramble/quick-add` and the moved
  `@todalo/ramble/quick-add-sync` serve both the legacy composer and the shared client.
- Browser 800×600 and 390×844 (mouse, keyboard Enter/Escape, taps): highlighting,
  rejecting a highlight, manual date/repeat overriding and rewriting the phrase, custom
  repeat (basis, every N units, end date), detected end time and repeat saved on create.
- Setting stored per account on the server: survives page reload and sign-out/sign-in;
  off means no highlighting and titles saved as typed; a failed save rolls the switch back
  with an error.
- Endpoint ownership/validation/cross-user tests, client transport/cache tests, Rust
  body tests; root test, typecheck and build pass; `cargo fmt --check`/`cargo test`.

Not verified: iOS software keyboard (Simulator UI control denied), Mac/iOS builds,
physical devices, real database.
