#!/usr/bin/env bash
#
# Sync data/ and scripts/ from src/ui-ux-pro-max/ into .claude/skills/ui-ux-pro-max/.
#
# Run this whenever data/*.csv or scripts/*.py change in the source of truth
# (src/ui-ux-pro-max/). The skill ships these as real file copies — not symlinks —
# so the plugin works on Windows clones (where git checkout drops symlinks).
#
# Usage:
#   bash scripts/sync-skill-assets.sh
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$REPO_ROOT/src/ui-ux-pro-max"
DST="$REPO_ROOT/.claude/skills/ui-ux-pro-max"

if [ ! -d "$SRC/data" ] || [ ! -d "$SRC/scripts" ]; then
  echo "ERROR: source dirs missing at $SRC" >&2
  exit 1
fi

echo "Syncing data/    -> $DST/data"
rm -rf "$DST/data"
cp -r "$SRC/data" "$DST/data"

echo "Syncing scripts/ -> $DST/scripts"
rm -rf "$DST/scripts"
cp -r "$SRC/scripts" "$DST/scripts"

# Drop Python caches that may have been copied along
find "$DST/scripts" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true

echo "Done. Stage changes with: git add .claude/skills/ui-ux-pro-max/"
