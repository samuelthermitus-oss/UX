#!/usr/bin/env bash
set -euo pipefail

echo "Converting symlinks to real files/directories..."

found=0
find . -type l -print0 | while IFS= read -r -d '' link; do
  found=1
  # Resolve absolute target
  target=$(readlink -f "$link" || true)
  if [ -z "$target" ] || [ ! -e "$target" ]; then
    echo "Skipping $link -> target missing: $target"
    continue
  fi

  echo "Replacing $link with copy of $target"
  # Prepare temp path
  tmp="${link}.tmp"
  # Ensure parent directory exists
  mkdir -p "$(dirname "$link")"

  if [ -d "$target" ]; then
    rm -rf "$tmp"
    cp -a "$target" "$tmp"
    rm "$link"
    mv "$tmp" "$link"
  else
    cp -a "$target" "$tmp"
    rm "$link"
    mv "$tmp" "$link"
  fi
done

if [ "$found" -eq 0 ]; then
  echo "No symlinks found."
fi

echo "Done."
