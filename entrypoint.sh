#!/bin/sh
set -e
bun run db/migrate.ts
node server.js
