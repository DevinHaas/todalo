# 01. Scaffold the docs application

Status: ready-for-agent
Type: task

**Blocked by:** None.

Spec: `.scratch/help-center/spec.md` (Application and deployment, Theme). Research notes: `/Users/devinhasler/projects/todalo-help-center-notes/`.

**What it delivers:** A new `apps/docs` workspace app (Next + Fumadocs, MDX in the repo) that builds and runs under the existing Bun workspace and Turbo pipeline. Brand fonts and colour tokens copied in from the marketing app, light and dark themes (system default, remembered choice), slim footer, one placeholder article proving MDX renders. A Dockerfile for a standalone build, following the pattern of the existing root Dockerfile.

**Acceptance:** `bun run build` and the root test command pass. The app starts locally and shows the placeholder article in both themes. No imports from `apps/client` or `apps/web`. Read `AGENTS.md` on the Next version before starting. If the research notes say Fumadocs does not support this Next version, use the fallback named in the spec and say so in Comments.

## Comments
