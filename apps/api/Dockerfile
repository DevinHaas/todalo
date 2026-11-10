FROM oven/bun:1.3.9 AS base
WORKDIR /app

FROM base AS dependencies
COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
COPY packages/auth/package.json packages/auth/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/ramble/package.json packages/ramble/package.json
COPY packages/server/package.json packages/server/package.json
COPY packages/badge/package.json packages/badge/package.json
COPY apps/client/package.json apps/client/package.json
RUN bun install --frozen-lockfile

FROM base AS runner
ENV NODE_ENV=production
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/apps ./apps
COPY --from=dependencies /app/packages ./packages
COPY apps/api/src ./apps/api/src
COPY packages/auth/src ./packages/auth/src
COPY packages/db/src ./packages/db/src
COPY packages/ramble/src ./packages/ramble/src
COPY packages/server/src ./packages/server/src
USER bun
EXPOSE 3001
CMD ["bun", "apps/api/src/index.ts"]
