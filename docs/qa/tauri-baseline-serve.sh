#!/usr/bin/env bash
set -eu
cd "$(dirname "$0")/../.."
route="$PWD/apps/web/app/tauri-baseline"
if [ -e "$route" ]; then echo "Refusing to overwrite an existing capture route" >&2; exit 1; fi
mkdir "$route"
mkdir -p /tmp/todalo-tauri-baseline
trap 'rm -rf "$route"' EXIT
cp docs/qa/tauri-baseline-page.tsx "$route/page.tsx"
# Type-only fixture imports need their original source paths after copying.
sed 's|../../apps/web/|../../|g' docs/qa/tauri-baseline-fixture.ts > "$route/tauri-baseline-fixture.ts"
cd apps/web
TZ=Europe/Zurich bun --env-file=../../.env run next dev --hostname 127.0.0.1 --port 3101
