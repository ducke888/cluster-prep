#!/usr/bin/env bash
# Build the React landing page and merge it into the project root so the
# Python http.server can serve everything from one origin:
#   /                 → React landing (built index.html)
#   /landing-assets/* → React JS/CSS bundles
#   /app.html         → vanilla study app (untouched)
#   /data/*.json      → shared exam data
#
# Run this any time you edit anything in app-react/.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/app-react"

echo "[build-landing] Installing deps (if needed)…"
npm install --silent

echo "[build-landing] Running vite build…"
npm run build

echo "[build-landing] Copying built files into project root…"
cd "$ROOT"
# The landing page becomes the site root. Use .new suffix + move-in-place so
# we never leave the root in a half-built state.
cp landing-build/index.html index.html.new
rm -rf landing-assets
mkdir -p landing-assets
# Vite emits into landing-build/landing-assets/* because of assetsDir config.
if [ -d landing-build/landing-assets ]; then
  cp -R landing-build/landing-assets/. landing-assets/
fi
# Copy anything vite put under landing-build/ that isn't the HTML/assets dir
# (e.g. favicon, public/ files). Skip index.html and landing-assets.
find landing-build -mindepth 1 -maxdepth 1 \
  ! -name index.html \
  ! -name landing-assets \
  -exec cp -R {} "$ROOT/" \;

mv index.html.new index.html
echo "[build-landing] Done. Refresh http://localhost:8765/"
