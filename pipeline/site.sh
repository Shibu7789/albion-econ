#!/usr/bin/env bash
# Copie les sources de app/ vers docs/ (site publié) avec un numéro de version qui force le rechargement
# des fichiers dans le navigateur (GitHub Pages les garde 10 minutes en cache).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
V="$(date -u +%Y%m%d-%H%M)"
cp "$ROOT/app/engine.js" "$ROOT/app/market.js" "$ROOT/app/app.js" "$ROOT/app/preset.js" "$ROOT/docs/"
sed "s/__VERSION__/$V/g" "$ROOT/app/index.html" > "$ROOT/docs/index.html"
touch "$ROOT/docs/.nojekyll"
echo "Site copié, version $V"
