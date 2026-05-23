#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -x .venv/bin/python ]]; then
  echo "Cannot start backend: .venv/bin/python does not exist." >&2
  echo "Run: python3 -m venv .venv && .venv/bin/python -m pip install -r requirements.txt" >&2
  exit 1
fi

if ! .venv/bin/python -c "import mcp, httpx, uvicorn" >/dev/null 2>&1; then
  echo "Cannot start backend: Python dependencies are missing." >&2
  echo "Run: .venv/bin/python -m pip install -r requirements.txt" >&2
  exit 1
fi

MCP_URL="${MCP_SERVER_URL:-http://127.0.0.1:8788/mcp}"
if ! .venv/bin/python - "$MCP_URL" <<'PY' >/dev/null 2>&1
import socket
import sys
from urllib.parse import urlparse

url = urlparse(sys.argv[1])
host = url.hostname or "127.0.0.1"
port = url.port or (443 if url.scheme == "https" else 80)
socket.create_connection((host, port), timeout=1).close()
PY
then
  echo "Cannot start backend: MCP server is not reachable." >&2
  echo "MCP_SERVER_URL: $MCP_URL" >&2
  echo "Run: ./scripts/start_mcp.sh" >&2
  exit 1
fi

exec .venv/bin/python app_server.py
