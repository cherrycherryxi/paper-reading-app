#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -x .venv/bin/python ]]; then
  echo "Cannot start MCP server: .venv/bin/python does not exist." >&2
  echo "Run: python3 -m venv .venv && .venv/bin/python -m pip install -r requirements.txt" >&2
  exit 1
fi

if ! .venv/bin/python -c "import mcp" >/dev/null 2>&1; then
  echo "Cannot start MCP server: Python dependencies are missing." >&2
  echo "Run: .venv/bin/python -m pip install -r requirements.txt" >&2
  exit 1
fi

exec .venv/bin/python reading_mcp_server.py
