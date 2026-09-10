#!/usr/bin/env bash
# Build and push the static site to the server. See README.md for first-time setup.
set -euo pipefail
cd "$(dirname "$0")"

HOST="${DEPLOY_HOST:-deploy@pinchs.be}"
DIR="${DEPLOY_DIR:-/var/www/pinchs.be}"
BASE="${DEPLOY_URL:-https://pinchs.be}"

npm run build

# macOS ships openrsync, which has neither --chmod nor -z. Fix the modes here
# instead: files in public/ are mode 600 in the repo, and rsync -a preserves
# that, which nginx serves as a 403.
chmod -R a+rX build/client
rsync -a --delete build/client/ "$HOST:$DIR/"

# Smoke test the routing nginx does that `_redirects` used to — a deploy that
# serves 404s for every page is the failure worth catching automatically.
for probe in "/ 302" "/en 200" "/en/world 200" "/fr/work/scrubble 200" "/nl/work 200" "/nope 404"; do
  set -- $probe
  code=$(curl -sS -o /dev/null -w '%{http_code}' "$BASE$1")
  [ "$code" = "$2" ] || { echo "smoke: $1 -> $code, wanted $2"; exit 1; }
done

echo "deployed to $HOST:$DIR — smoke ok"
