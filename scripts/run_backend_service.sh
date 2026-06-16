#!/bin/bash
# Unattended backend runner for launchd (stable serving, NOT the dev watcher).
# Sources .env for API keys, then runs app_server.py directly. Unlike
# start_backend.sh it does NOT gate on the MCP server — the web app serves
# fine without it, and an unattended service must not refuse to start.
cd "$(dirname "$0")/.." || exit 1
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi
exec .venv/bin/python app_server.py
