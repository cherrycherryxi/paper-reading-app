#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -x .venv/bin/python ]]; then
  echo "Cannot start dev backend: .venv/bin/python does not exist." >&2
  echo "Run: python3 -m venv .venv && .venv/bin/python -m pip install -r requirements.txt" >&2
  exit 1
fi

exec .venv/bin/python scripts/dev_backend.py
