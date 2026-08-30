#!/bin/bash
# Legacy task adapter; implementation lives in the shared user runtime.
set -euo pipefail
TARGET="${PAPER_CODEX_COMPAT_BIN:-/Users/huangnanqi/.local/bin/codex-exec-compat}"
[ -x "$TARGET" ] || { echo "paper Codex compatibility shim is unavailable: $TARGET" >&2; exit 127; }
exec "$TARGET" "$@"
