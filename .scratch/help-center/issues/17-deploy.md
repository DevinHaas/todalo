# 17. Deploy to help.todalo.app

Status: ready-for-human
Type: task

**Blocked by:** 05.

Spec: `.scratch/help-center/spec.md` (Application and deployment).

**What it delivers:** A Coolify service for the docs app on `help.todalo.app`, separate from the marketing site and API. The owner adds the DNS record and makes `support@todalo.app` reachable.

**Acceptance:** The site is live over HTTPS with only reviewed, published articles visible.

## Comments

2026-11-11 — Ready for the owner. Notes from the build work:
- Build with `apps/docs/Dockerfile` from the repo root as context. `apps/docs/Dockerfile.dockerignore` lets `.git` into this build only; a git-only stage writes the article dates and only that file reaches the image.
- In Coolify, turn **off** shallow clone for this service, or every article shows the same "last updated" date.
- Optional env: `NEXT_PUBLIC_POSTHOG_KEY` (same project as the marketing site); analytics stay off without it. Never set `DOCS_PREVIEW` in production (it is ignored there anyway).
- Domain `help.todalo.app` (DNS record by the owner); support mailbox `support@todalo.app` by the owner.
- With every article `published: false` the site shows the landing page with no categories. Publish a category by setting `published: true` on its articles; the build fails if a published article links to an unpublished one.
- When Integrations is published, switch the client's calendar help link back (see ticket 14).
