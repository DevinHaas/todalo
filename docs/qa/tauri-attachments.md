# Attachments — ticket 9 evidence

Recorded 15 October 2026 against the isolated in-memory QA API
(`apps/client/scripts/auth-smoke-server.ts`, `QA_API_PORT=3049`,
`QA_CLIENT_ORIGIN=http://localhost:5193`, Vite on 5193). It seeds a legacy-format
attachment (`Legacy brief.txt` on `/tasks/undated`, base64 like a
`task_attachments` row) and a second user's attachment (`qa-other-file`). No
production data; the user's port-3001 API was not used. Screenshots are in
`docs/qa/tauri-attachments/`.

## Browser walkthrough (Chromium via Playwright)

- **Choose files** (`/projects/qa-work`, 1280×800): "Add files" picked
  `meeting notes.txt` and `über plan.bin` (1 KiB, all 256 byte values) → "2 file
  tasks created."; both appear as Work tasks (`project-desktop.png`).
- **Open and download** (`/tasks/<id>`): the task shows "Attachments" with
  `über plan.bin (1 KB)` (`task-attachments-desktop.png`). The link downloaded
  as `über plan.bin`; SHA-256 of the download equals the original
  (`785b0751…c26c9`).
- **Existing attachment compatibility**: `/tasks/undated` lists the seeded legacy
  row and downloads it as `Legacy brief.txt` with the stored text unchanged.
- **Paste** (outside text fields) created `pasted.txt` (`text/plain`, 12 bytes);
  the same paste dispatched on the project-name input was left to the input
  (`defaultPrevented: false`). **Drop** created `dropped.png` (`image/png`, 3 bytes).
  Paste and drop were synthetic DOM events carrying real `File`s.
- **Limits and errors**: a 5 MiB + 1 byte file shows "Files must contain content
  and be at most 5 MB each." with no retry offered (`error-mobile.png`). A
  connection reset (Playwright route abort) shows the connection message plus
  "Check the project before retrying…" and **Retry upload**; retry created the
  task once (`retry-desktop.png`).
- **Ownership** (cookie session in the page): the other user's attachment,
  task attachment list and project upload all return the same `404 NOT_FOUND`
  envelope as missing IDs. A cookie upload without an allowed `Origin` is `403`.
- **390×844**: project and task screens have no horizontal overflow
  (`project-mobile.png`, `task-attachments-mobile.png`).

## Native transport checks (no UI)

- A multipart body produced by the Rust `upload_body` (`über plan.bin` as
  `application/x-custom`, `say "hi".txt`) was posted with a bearer from
  `/api/auth/sign-in/email` to the Bun QA API: `201`, both tasks created, media
  types and names (including `"`) preserved, bytes identical on download. The
  same body without a bearer or `Origin` was `403`.
- Oversized batches over the Bun server: an 11 MiB body and three 3.4/3.6 MiB
  files from Node `fetch` get `413 FILES_TOO_LARGE`. (Bun's own `fetch` sometimes
  receives a bare `400` from Bun's server for the 10.8 MB FormData case before the
  handler runs; Node clients and browsers did not.) Through the Vite dev proxy the
  early 413 surfaces as a 502 — the client checks limits first, so users see the
  specific message instead.

## Automated coverage

- `packages/server/src/attachment-http.test.ts`: multipart parser keeps each part's
  declared type and exact bytes, decodes WHATWG-encoded UTF-8 names, rejects
  malformed bodies.
- `apps/api/src/attachment-routes.test.ts` (real shared operations over the
  relational test boundary): 401 on every route; one owned task per file with
  exact bytes; legacy rows download unchanged with the legacy headers; identical
  404 for foreign and missing IDs at upload/list/download; every legacy limit
  (count, empty, 5 MB, 10 MB batch, names, types) rejected before storage;
  non-multipart and oversized/streamed bodies cut at the transport; cookie writes
  need an allowed Origin, bearer writes ignore cookies.
- `apps/web/app/api/attachments/attachments.test.ts` (unchanged) still passes
  through the moved shared code, so the legacy paste/list/download routes keep
  their behaviour.
- `apps/client/src/attachments.test.ts`: browser transport paths/encoding/error
  mapping, native transport (one raw IPC body, ASCII metadata header, fixed
  commands), Rust error strings recognised, limits checked before sending,
  project-only invalidation, view states.
- `src-tauri/src/attachments.rs`: browser-identical multipart framing, limits
  matching the server, safe non-overwriting save paths.
- On a clean worktree of this commit: root `bun run test` (409 tests),
  `bun run typecheck`, `bun run build`, `cargo fmt --check`, `cargo test --locked`
  pass; `bun run lint` has only the 3 known apps/web errors.

## Not verified

- **Mac app UI**: a debug bundle built (`TODALO_API_BASE_URL=http://127.0.0.1:3049
  bun tauri build --debug --bundles app --ci`) and launched, but control of the app
  was not granted, so native picker, paste, drag/drop (`dragDropEnabled: false` is
  set so HTML5 drop receives files), raw-body IPC upload, `save_attachment` to
  Downloads and relaunch were not exercised.
- **iPhone**: not run — another agent was using the shared simulator. File
  selection through WKWebView's picker, saving to Files › On My iPhone › todalo
  (`UIFileSharingEnabled` + `LSSupportsOpeningDocumentsInPlace`) and relaunch are
  unverified.
- Picker/dialog cancellation is handled as "no files → no change" in code and
  tests; an in-flight upload cannot be cancelled (same as legacy).
- Postgres itself: storage is the existing `task_attachments` row; tests use the
  relational boundary, not a database.
