#!/bin/sh
set -e
bun run packages/db/src/migrate.ts
exec node apps/web/server.js
