#!/bin/bash
# Thin wrapper — the loop now lives in ~/.config/scripts/afk-ralph (generic, streaming,
# browser-capable sandbox). Kept so `./scripts/loop.sh <feature> [iterations]` still works.
exec afk-ralph "$(cd "$(dirname "$0")/.." && pwd)" "$@"
