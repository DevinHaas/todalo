# Help center (apps/docs). Build with the repo root as context:
#   docker build -f apps/docs/Dockerfile .
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/api/package.json ./apps/api/package.json
COPY apps/client/package.json ./apps/client/package.json
COPY apps/docs/package.json ./apps/docs/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/auth/package.json ./packages/auth/package.json
COPY packages/ramble/package.json ./packages/ramble/package.json
COPY packages/server/package.json ./packages/server/package.json
COPY packages/badge/package.json ./packages/badge/package.json
RUN bun install --frozen-lockfile

FROM oven/bun:1 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps ./apps
COPY --from=deps /app/packages ./packages
COPY . .
ARG NEXT_PUBLIC_POSTHOG_KEY
ENV NEXT_PUBLIC_POSTHOG_KEY=$NEXT_PUBLIC_POSTHOG_KEY
RUN bun run --filter @todalo/docs build

FROM oven/bun:1 AS runner
WORKDIR /app
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000

# Every page is prerendered, so the standalone bundle is all the runner needs.
COPY --from=builder /app/apps/docs/public ./apps/docs/public
COPY --from=builder /app/apps/docs/.next/standalone ./
COPY --from=builder /app/apps/docs/.next/static ./apps/docs/.next/static

USER bun
EXPOSE 3000
# node, as entrypoint.sh does for the web image on this base.
CMD ["node", "apps/docs/server.js"]
