FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:1 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Next's build touches these modules while collecting page data (they aren't
# actually called), so a placeholder is enough — real values come from .env
# at container runtime, never baked into the image.
ENV DATABASE_URL="postgres://user:pass@localhost:5432/db" \
    BETTER_AUTH_SECRET="build-time-placeholder" \
    BETTER_AUTH_URL="http://localhost:3000" \
    GOOGLE_CLIENT_ID="build-time-placeholder" \
    GOOGLE_CLIENT_SECRET="build-time-placeholder"
RUN bun run build

FROM oven/bun:1 AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/drizzle.config.ts ./
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/db ./db
COPY --from=builder /app/lib ./lib
COPY --from=deps /app/node_modules ./node_modules
COPY entrypoint.sh ./

EXPOSE 3000
ENTRYPOINT ["./entrypoint.sh"]
