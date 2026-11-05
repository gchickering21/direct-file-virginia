#!/usr/bin/env bash
# `make site-demo` (and so `make publish`): the IRS's Fact Explorer, built as a static page over the
# Virginia site's dictionary and flow, into out/fact-explorer/ beside the site (docs/hosting.md).
#
# The Explorer is a Vite single-page app in taxpert/packages/fact-explorer. It needs no Scala: its
# own generator parses the Flow XML and the fact dictionary into a graph (public/data/<app>/), and a
# registry (public/data/apps.json) built from each application's fact-explorer.app.json tells it
# where the application's engine, dictionary and scenarios are served. Nothing in the IRS tree is
# edited: the descriptor is copied into a scratch apps directory with the hosted base path, and the
# generated files are removed from taxpert/ afterwards.
#
# Three things in the built app are written against the domain root and have to be rewritten for a
# host that mounts the site under a prefix: the registry and graph under /data/, the route
# /fact-explorer, and the USWDS fonts under /uswds/. They are rewritten in the built output, not
# in the source, so the IRS files stay byte for byte the pin's.
#
#   stack/fact-explorer.sh <site base path> <explorer base path> <out dir>
#   e.g. stack/fact-explorer.sh /direct-file-virginia/app/direct-file /direct-file-virginia/fact-explorer virginia/direct-file/out/fact-explorer
cd "$(dirname "$0")/.."
# The toolchain before set -e: nvm's `use` returns non-zero on some machines while still putting node on the path.
. stack/toolchain.sh
set -euo pipefail
# No apostrophes in these messages: inside ${n:?word} the word is unquoted, and bash 3.2 would read on from one.
SITE_BASE=${1:?the site base path, e.g. /app/direct-file}
FE_BASE=${2:?the explorer base path, e.g. /fact-explorer}
OUT=${3:?the output directory}
PORT_DIR=$(sed -n 's/^PORT *:= *//p' Makefile)
FE=taxpert/packages/fact-explorer
ROOT=$PWD

[ -d "$FE/node_modules" ] || [ -x taxpert/node_modules/.bin/vite ] || { echo "==> the Fact Explorer's packages are not installed: (cd taxpert && npm install)"; exit 1; }
# macOS 13: sass-embedded's Dart VM wants 14 and hangs the build; the JavaScript sass does the job (docs/macos-13.md).
if [ "$(uname)" = Darwin ] && [ "$(sw_vers -productVersion | cut -d. -f1)" -lt 14 ] && [ -d taxpert/node_modules/sass-embedded ]; then
  echo "==> macOS $(sw_vers -productVersion): sass-embedded will hang this build. Swap it for sass (docs/macos-13.md):"
  echo "    cd taxpert && npm install --no-save sass && rm -rf node_modules/sass-embedded node_modules/sass-embedded-darwin-* packages/fact-explorer/node_modules/sass-embedded"
  exit 1
fi

# The scratch apps directory: the descriptor with the hosted base path, and the sources beside it.
APPS=$(mktemp -d)
trap 'rm -rf "$APPS"; rm -rf "$FE/public/data/direct-file" "$FE/public/data/apps.json" "$FE/dist"' EXIT
mkdir -p "$APPS/direct-file"
python3 - "$PORT_DIR/fact-explorer.app.json" "$APPS/direct-file/fact-explorer.app.json" "$SITE_BASE" <<'PY'
import json, sys
d = json.load(open(sys.argv[1])); d["basePath"] = sys.argv[3]; d["label"] = "Direct File, with the Virginia return"
json.dump(d, open(sys.argv[2], "w"), indent=1)
PY
ln -s "$ROOT/$PORT_DIR/src" "$APPS/direct-file/src"

echo "==> the Fact Explorer: the registry and the graph"
( cd "$FE" && FORM_BUILDER_APPS_DIR="$APPS" node scripts/build-registry.mjs >/dev/null && FORM_BUILDER_APPS_DIR="$APPS" node scripts/make-static-fgm.mjs --app direct-file | tail -2 )
echo "==> the Fact Explorer: the page (vite build)"
# The workspace root's own vite, not npx: with the binary hoisted to taxpert/node_modules, npx stops
# at an install prompt that a piped build never sees.
( cd "$FE" && VITE_FGM_SOURCE=real ../../node_modules/.bin/vite build --base "$FE_BASE/" --logLevel warn < /dev/null )

# The rewrite of the root-relative paths, in the built output only.
python3 - "$FE/dist" "$FE_BASE" <<'PY'
import pathlib, re, sys
dist, base = pathlib.Path(sys.argv[1]), sys.argv[2]
n = 0
for f in list(dist.rglob("*.js")) + list(dist.rglob("*.css")) + [dist / "index.html"] + list((dist / "data").rglob("*.json")):
    if not f.is_file(): continue
    s = f.read_text(errors="surrogateescape")
    t = s
    t = re.sub(r'(["\'`])/data/', lambda m: m.group(1) + base + "/data/", t)
    t = re.sub(r'(["\'`])/fact-explorer(["\'`/])', lambda m: m.group(1) + base + m.group(2), t)
    # The route parser slices the app id off after the route constant, and the minifier folds that
    # constant's length into a literal: `appId:e.slice(14)`. Exactly one such site, or this build has
    # changed shape and the rewrite must be looked at rather than trusted.
    if f.suffix == ".js":
        t, k = re.subn(r"(appId:\w+\.slice\()14(\)\.replace\(/\^\\//)", lambda m: m.group(1) + str(len(base)) + m.group(2), t)
        if k != 1: sys.exit(f"fact-explorer.sh: expected one route slice(14) in {f.name}, found {k}")
    t = t.replace("url(/uswds/", f"url({base}/uswds/").replace('url("/uswds/', f'url("{base}/uswds/')
    if t != s: f.write_text(t, errors="surrogateescape"); n += 1
print(f"rewrote root-relative paths in {n} built files")
PY

rm -rf "$OUT"; mkdir -p "$OUT"
cp -R "$FE/dist/." "$OUT/"
# The two IRS fixture apps committed under public/data/ ride along in dist/; only this app is registered.
rm -rf "$OUT/data/credit-assistant" "$OUT/data/twe"
# A deep link (/fact-explorer/direct-file) on a static host needs a file there: the same page.
mkdir -p "$OUT/direct-file" && cp "$OUT/index.html" "$OUT/direct-file/index.html"
echo "==> the Fact Explorer: $OUT/ ($(find "$OUT" -type f | wc -l | tr -d ' ') files, $(du -sh "$OUT" | cut -f1)), served at $FE_BASE/"
