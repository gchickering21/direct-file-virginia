#!/usr/bin/env bash
# `make proof`: run the three checks against a built site and write what the proof page reads into
# out/app/direct-file/resources/proof/: cases.json (the 50 households against the independent model),
# a11y.json (axe over every Virginia route), tests.json (the ScalaTest suite) and build.json.
#
# The built site's links start with SITE_BASE_PATH (stack/site.env), so it is served here from a
# folder where that prefix leads to out/app: a static server rooted there, on its own port, for the
# minutes the browser checks take. A failing check is recorded, not hidden: the page shows it in red,
# and this script's exit code says so, so `make publish` stops unless PROOF_STRICT=0.
set -uo pipefail
cd "$(dirname "$0")/.."
. stack/site.env
. stack/toolchain.sh
# The Virginia site's folder, from the Makefile's one definition of it.
PORT_DIR=$(sed -n 's/^PORT *:= *//p' Makefile)
[ -n "$PORT_DIR" ] && [ -d "$PORT_DIR" ] || { echo "==> cannot find the Virginia site: PORT in the Makefile is '$PORT_DIR'"; exit 1; }
OUT="$PORT_DIR/out"
PROOF="$OUT/app/direct-file/resources/proof"
PROOF_PORT=${PROOF_PORT:-3013}
BASE_PATH=${BASE_PATH:-$SITE_BASE_PATH}

[ -f "$OUT/app/direct-file/resources/start/index.html" ] || { echo "==> no built site in $OUT: make site-demo first"; exit 1; }
mkdir -p "$PROOF"

# Serve out/app at $BASE_PATH's parent: /direct-file-virginia/app/direct-file → <root>/direct-file-virginia/app → out/app.
ROOT=$(mktemp -d)
PREFIX=${BASE_PATH%/app/direct-file}
mkdir -p "$ROOT$PREFIX"
ln -s "$(cd "$OUT/app" && pwd)" "$ROOT$PREFIX/app"
# The server is started directly, not in a subshell, so the trap's kill reaches it; a stale one from an
# interrupted run would otherwise hold the port and answer 404 for a folder that is gone.
if lsof -nP -iTCP:"$PROOF_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "==> port $PROOF_PORT is in use ($(lsof -nP -iTCP:"$PROOF_PORT" -sTCP:LISTEN | awk 'NR==2 {print $1" "$2}')): stop it, or PROOF_PORT=<another>"; exit 1
fi
python3 -m http.server "$PROOF_PORT" --directory "$ROOT" >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null; rm -rf "$ROOT"' EXIT
BASE_URL="http://localhost:$PROOF_PORT$BASE_PATH"
for i in $(seq 1 40); do curl -sfo /dev/null "$BASE_URL/resources/start/" && break; sleep 0.5; done
curl -sfo /dev/null "$BASE_URL/resources/start/" || { echo "==> could not serve the built site at $BASE_URL"; exit 1; }
echo "==> the built site is at $BASE_URL for the checks"

FAIL=0
echo "==> the households (make cases)"
CASES_REPORT="$PWD/$PROOF/cases.json" make -s cases BASE_URL="$BASE_URL" || FAIL=1
echo "==> the screens (make a11y)"
A11Y_REPORT="$PWD/$PROOF/a11y.json" make -s a11y BASE_URL="$BASE_URL" || FAIL=1
echo "==> the test suite (make test)"
TESTLOG=$(mktemp)
make -s test > "$TESTLOG" 2>&1 || FAIL=1
tail -3 "$TESTLOG"
python3 - "$TESTLOG" "$PROOF/tests.json" <<'PY'
import json, re, sys
log = open(sys.argv[1], errors="replace").read()
m = re.search(r"Tests: succeeded (\d+), failed (\d+), canceled (\d+), ignored (\d+), pending (\d+)", log)
counts = dict(zip(["succeeded", "failed", "canceled", "ignored", "pending"], map(int, m.groups()))) if m else {"succeeded": 0, "failed": 0, "error": "no ScalaTest summary in the log"}
# What VirginiaSpec covers: sbt prints each subject under the suite's heading (the test names
# themselves only on failure), so the subjects are what the page can list.
virginia, inside = [], False
for line in log.splitlines():
    line = re.sub(r"^\[info\] ?", "", line).strip()
    if re.match(r"^VirginiaSpec:", line): inside = True; continue
    if inside and (re.match(r"^\S.*Spec:$", line) or not line or line.startswith("Run completed") or line.startswith("Total number")): inside = False
    if inside: virginia.append(re.sub(r"^- ", "", line))
json.dump({"ran": __import__("datetime").datetime.now().isoformat(timespec="seconds"), **counts, "virginia": virginia}, open(sys.argv[2], "w"), indent=1)
print(f"tests.json: {counts}, {len(virginia)} VirginiaSpec tests named")
PY
rm -f "$TESTLOG"

python3 - "$PROOF/build.json" <<'PY'
import json, subprocess, sys, datetime
g = lambda *a: subprocess.run(["git", *a], capture_output=True, text=True).stdout.strip()
json.dump({"commit": g("rev-parse", "--short", "HEAD"), "dirty": bool(g("status", "--porcelain", "--untracked-files=no")), "date": datetime.date.today().isoformat()}, open(sys.argv[1], "w"))
PY
echo "==> written: $PROOF/{cases,a11y,tests,build}.json"
[ $FAIL -eq 0 ] && echo "==> every check passed" || echo "==> A CHECK FAILED: the proof page will say so"
exit $FAIL
