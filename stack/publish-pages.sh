#!/usr/bin/env bash
# `make publish`: build the demo site under the hosted prefix and push it, as one commit with no history,
# to the branch GitHub Pages serves (docs/hosting.md). Everything comes from stack/site.env.
#
# The branch is rebuilt from nothing every time and force-pushed: the site is a build product, so its
# history is the source tree's, and the commit message names the source commit it was built from.
set -euo pipefail
cd "$(dirname "$0")/.."
. stack/site.env
PORT=virginia/direct-file

OUT="$PORT/out"
if [ "${REBUILD:-1}" = "0" ]; then
  # REBUILD=0: push what make site-demo (and make proof) already left in out/, built under the hosted prefix.
  echo "==> not rebuilding (REBUILD=0): publishing $OUT as it is"
else
  # From nothing: a local build leaves its own tree in out/, and the host would serve it beside this one.
  rm -rf "$OUT"
  echo "==> building the site, its links under $SITE_BASE_PATH"
  make site-demo SITE_BASE_PATH="$SITE_BASE_PATH"
fi
# The output folder is always out/app/direct-file; the host mounts it under its own prefix.
[ -f "$OUT/app/direct-file/resources/start/index.html" ] || { echo "==> no start page in $OUT/app/direct-file: the build did not run"; exit 1; }
grep -q "content=\"$SITE_BASE_PATH\"" "$OUT/app/direct-file/index.html" "$OUT"/app/direct-file/*/index.html 2>/dev/null \
  || grep -rq "form-builder:base-path\" content=\"$SITE_BASE_PATH\"" "$OUT/app/direct-file/your-taxes" \
  || { echo "==> the pages do not carry $SITE_BASE_PATH as their base path: Main.scala did not see -Dsite.basePath"; exit 1; }

# The checks, into the proof page (stack/proof.sh). PROOF=0 skips them; PROOF_STRICT=0 publishes even if one fails.
if [ "${PROOF:-1}" != "0" ]; then
  if ! make proof; then
    [ "${PROOF_STRICT:-1}" = "0" ] || { echo "==> a check failed; not publishing (PROOF_STRICT=0 to publish anyway, PROOF=0 to skip the checks)"; exit 1; }
  fi
fi

SRC=$(git rev-parse --short HEAD)
DIRTY=$(git status --porcelain --untracked-files=no | grep -q . && echo " (with uncommitted changes)" || true)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
cp -R "$OUT"/. "$TMP"/
# GitHub Pages runs Jekyll unless told not to; Jekyll drops files and folders it does not like.
touch "$TMP/.nojekyll"
# The root of the Pages site is above the base path. Send it to the start page.
START="${SITE_BASE_PATH}/resources/start/"
cat > "$TMP/index.html" <<HTML
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=$START"><link rel="canonical" href="$START"><title>Redirecting</title></head><body><p>Redirecting to <a href="$START">the start page</a>.</p></body></html>
HTML
# A 404 page that also goes to the start page: a stale link to a screen is the common case.
cp "$TMP/index.html" "$TMP/404.html"

REMOTE_URL=$(git remote get-url "$SITE_REMOTE")
echo "==> pushing $(find "$TMP" -type f | wc -l | tr -d ' ') files ($(du -sh "$TMP" | cut -f1)) to $REMOTE_URL $SITE_BRANCH"
git -C "$TMP" init -q
git -C "$TMP" checkout -q -b "$SITE_BRANCH"
git -C "$TMP" add -A
git -C "$TMP" -c user.name="$(git config user.name)" -c user.email="$(git config user.email)" commit -q -m "site: built from $SRC$DIRTY on $(date +%Y-%m-%d)"
git -C "$TMP" push -q -f "$REMOTE_URL" "$SITE_BRANCH"
echo "==> pushed. The first time: GitHub > Settings > Pages > Source: Deploy from a branch, $SITE_BRANCH, / (root)."
echo "==> then, a minute later: $SITE_URL"
