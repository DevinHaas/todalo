# 10. Verify the native feasibility slice before broad migration

Status: provisionally approved — physical iPhone and signed Mac pending
Type: task

**Blocked by:** 4, 6, 7, 9.
    **What it delivers:** One documented walkthrough demonstrates that Todalo can sign in, manipulate tasks, transfer files, record audio and provide feedback on the actual target devices.
    **Acceptance:** Record device/OS/build evidence and resolve auth/storage/audio failures; freeze the initial support matrix, auth transport and callback decisions; verify the legacy site still works. Approval of this gate unlocks broad feature migration; it is not a framework reconsideration ticket.

## Comments

Published from the approved implementation proposal on 2026-10-04. Eligibility requires every listed blocker to be complete.

2026-10-15 — gate walkthrough (evidence: `docs/qa/tauri-feasibility-gate.md`).
Physical iPhone testing was deferred by the user; the walkthrough ran on the iOS
26.0.1 Simulator (iPhone 17 Pro), the browser client and scriptable Mac checks,
against the disposable QA API.

- Verified in the Simulator: email sign-in, relaunch/reboot persistence, sign-out,
  fake-Google warm return, create/complete/delete over native IPC, completion
  feedback call, native project create/open/rename/delete, Photos upload over
  raw-body IPC, byte-identical `save_attachment` to Files, Ramble capture through
  the one-use ticket socket, no secrets in the unified log.
- Fixed: the native CSP blocked Ramble's `blob:` AudioWorklet and surfaced it as a
  microphone denial (`60c0627`).
- Confirmed limitation: OAuth cold return drops the launch URL (tao 0.37.1); one
  extra "Return to todalo" tap completes it. Universal link or
  ASWebAuthenticationSession before release.
- Mac UI: control of the app was denied; build, `cargo test --locked` and the
  Keychain round trip passed. Mac UI flows are unverified.
- Not verified: OS microphone prompt (simulator uses a mock device), haptics felt,
  real Google, physical iPhone, signed Mac, minimum OS versions, legacy Next UI
  against a real database (its production build and the root suite pass).
- Frozen decisions and the hardware re-run checklist are in the QA doc. Broad
  feature migration may proceed; tickets 23/24 must run the checklist first.
