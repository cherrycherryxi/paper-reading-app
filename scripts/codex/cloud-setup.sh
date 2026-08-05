#!/bin/bash
# Codex Cloud environment setup for paper-reading-app.
set -euo pipefail

REPO_ROOT=$(git rev-parse --show-toplevel)
cd "$REPO_ROOT"

if [ ! -x .venv/bin/python ]; then
  python3 -m venv .venv
fi

.venv/bin/python -m pip install --disable-pip-version-check -r requirements.txt
node --version
git --version
