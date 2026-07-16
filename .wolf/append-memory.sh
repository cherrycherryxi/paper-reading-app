#!/bin/bash
# Appends one line to .wolf/memory.md, formatted per OPENWOLF.md convention.
# Usage: append-memory.sh <description> <file(s)> <outcome> <tokens>
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MEMORY_FILE="$DIR/memory.md"

DESC="${1:?usage: append-memory.sh <description> <file(s)> <outcome> <tokens>}"
FILES="${2:-—}"
OUTCOME="${3:-done}"
TOKENS="${4:-~?}"
TS="$(date +%H:%M)"

printf '| %s | %s | %s | %s | %s |\n' "$TS" "$DESC" "$FILES" "$OUTCOME" "$TOKENS" >> "$MEMORY_FILE"
echo ok
