#!/usr/bin/env bash
# Reconstruit tout l'outil depuis les données officielles du jeu, puis lance les tests.
# Usage : bash pipeline/update.sh            (depuis la racine du dépôt)
# Sortie : docs/ (site publié par GitHub Pages) ; build/ (données intermédiaires, non versionnées)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$ROOT/build"
DUMP="$BUILD/ao-bin-dumps"
mkdir -p "$BUILD/out"

# 1. Données officielles du client (dépôt ao-data/ao-bin-dumps), uniquement les fichiers utiles
FILES="/items.json /formatted/world.json /localization.json /gamedata_europe.json /craftingmodifiers.json \
/farmingmodifiers.json /marketplace_europe.json /buildings.json /loot.json /achievements.json"
if [ ! -d "$DUMP/.git" ]; then
  git clone --depth 1 --filter=blob:none --sparse https://github.com/ao-data/ao-bin-dumps.git "$DUMP"
  git -C "$DUMP" sparse-checkout set --no-cone $FILES
else
  git -C "$DUMP" fetch --depth 1 origin
  git -C "$DUMP" reset --hard origin/HEAD
  git -C "$DUMP" sparse-checkout set --no-cone $FILES
fi
echo "Données du jeu : $(git -C "$DUMP" log -1 --format='%H %cs')"

# 2. Base économique puis données compactes de l'outil
python3 -I "$ROOT/pipeline/build_base.py" "$DUMP" "$BUILD/out"
python3 -I "$ROOT/pipeline/build_modules.py" "$DUMP" "$BUILD/out"
python3 -I "$ROOT/pipeline/build_destiny.py" "$DUMP" "$BUILD/out"
python3 -I "$ROOT/pipeline/build_app_data.py" "$DUMP" "$BUILD/out" "$ROOT/docs/data.js"

# 3. Site
cp "$ROOT/app/index.html" "$ROOT/app/engine.js" "$ROOT/app/market.js" "$ROOT/app/app.js" "$ROOT/docs/"
touch "$ROOT/docs/.nojekyll"

# 4. Tests (le moteur, puis la page dans un vrai navigateur avec des prix simulés)
node "$ROOT/tests/engine.test.js"
node "$ROOT/tests/e2e.test.js"
echo "Reconstruction terminée et testée."
