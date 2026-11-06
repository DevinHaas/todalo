# Tauri migration review

Base: `e6b21cb245574d50ce78fca1c59da97610c142f8`.
Ticket 1 review target: `bcaf034`.
Standards and spec were reviewed independently by separate agents using the code-review skill.

## Standards

No actionable findings. Existing workspace conventions, ownership predicates, label association scope, ordering and relevant ADRs are preserved. The capture server binds to loopback and the temporary capture route is removed on normal exit and interruption.

## Spec

Two P2 findings were repaired in `b5013ea` and verified by the independent spec reviewer:

1. Email registration in the legacy login screen was missing from the operation inventory. Registration is now explicitly included in ticket 2's proposal and inventory, with required validation before retirement in ticket 28.
2. The extracted Today count captured the default clock before asynchronous reads. The query now resolves its default clock after database reads; the page recounts after task and calendar reads finish. Two additional regressions cover pending reads crossing midnight and the public recount helper.

The fixture-based PNG artifacts are real and reproducible; they are accurately distinguished from live authenticated route and Apple-device evidence. Broad native and release acceptance remains open.

Initial ticket 1 findings: Standards 0; Spec 2 P2. Both Spec findings closed; seven focused regressions and server/web typechecks passed. No new consequential spec issue was found in the repair delta.

## Ticket 2 Standards

Target `26457f1`, with repair `2b9d83d`. No actionable findings. Tokens remain in Rust/Apple Keychain, native commands are serialized and explicitly permissioned, and endpoint validation rejects redirects and insecure release requests. An isolated handler check confirmed legacy-origin registration and cookie logout with and without additional configured trusted origins. No documented-standard breach or consequential baseline smell was found.

## Ticket 2 Spec

One P2 finding was repaired in `2b9d83d` and independently re-reviewed: account refresh discarded safe Keychain/configuration recovery messages and replaced them with incorrect network advice. An exact allowlist maps known native messages to typed transport errors; unknown IPC payloads remain sanitized. Refresh preserves safe instructions and the heading now says Account unavailable. Three added regressions cover Keychain denial, missing endpoint configuration and unknown-error sanitization.

Email registration, legacy cookies, signed bearer handling, cache clearing and stale-read protections are implemented. Ticket 2 correctly remains in progress because enrolled-team identities, signed physical iPhone/Mac install/lifecycle checks, device failure cases and support-matrix confirmation remain unverified. Local Mac login/relaunch/logout was exercised by the parent after review; these checks do not close signed-device acceptance.

Final totals: Standards 0 actionable findings; Spec 3 P2 findings across both tickets, all repaired and re-reviewed. Explicit hardware acceptance is still open. Final full suite: 30 files / 301 tests passed; all seven typechecks and all three production builds passed. Repository lint has three independently reproduced pre-existing errors in unchanged legacy files.
