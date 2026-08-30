#!/bin/bash
# Project-local stable adapter; implementation lives in the shared user runtime.
set -euo pipefail
TARGET="${PAPER_AGENT_RUNNER_BIN:-/Users/huangnanqi/.local/bin/agent-runner}"
[ -x "$TARGET" ] || { echo "paper agent runner is unavailable: $TARGET" >&2; exit 127; }
exec "$TARGET" "$@"
