#!/usr/bin/env bash
# `make doctor`: is this machine ready to run the Virginia return? One line per tool, OK / MISSING /
# WARN, with the fix beside anything that is not there. Exit 1 if something required is missing.
#
# Two ways in (GETTING_STARTED.md): Docker alone, or the native toolchain (JDK 21 + sbt). One of the two
# is required; the other is reported but does not fail the check. Node 22, python3 and xmllint are
# needed by the checks on either path.
set -uo pipefail
cd "$(dirname "$0")/.."
. stack/toolchain.sh
FAIL=0
ok()      { printf '  OK       %s\n' "$1"; }
warn()    { printf '  WARN     %s\n' "$1"; }
missing() { printf '  MISSING  %s\n           fix: %s\n' "$1" "$2"; FAIL=1; }
optional(){ printf '  MISSING  %s (optional)\n           fix: %s\n' "$1" "$2"; }
vernum()  { { [ $# -gt 0 ] && printf '%s' "$1" || cat; } | grep -oE '[0-9]+(\.[0-9]+)+' | head -1; }   # arg or stdin
# "is $1 >= $2", dotted versions
atleast() { [ "$(printf '%s\n%s\n' "$2" "$1" | sort -t. -k1,1n -k2,2n -k3,3n | head -1)" = "$2" ]; }

echo "Docker path"
DOCKER_OK=0
if ! command -v docker >/dev/null; then
  missing "docker" "install Docker Desktop 4.18 or newer (macOS 13: 4.48.0, see docs/macos-13.md)"
elif ! docker info >/dev/null 2>&1; then
  missing "docker daemon (installed, not running)" "start Docker Desktop"
else
  COMPOSE=$(vernum "$(docker compose version 2>/dev/null)")
  MEM=$(docker info --format '{{.MemTotal}}' 2>/dev/null || echo 0)
  MEMGB=$(( MEM / 1073741824 ))
  if [ -z "$COMPOSE" ] || ! atleast "$COMPOSE" 2.17; then
    missing "docker compose ${COMPOSE:-?} (want 2.17 or newer)" "update Docker Desktop; its Compose did not know additional_contexts before 2.17"
  elif [ "$MEM" -lt $((8 * 1073741824)) ]; then
    missing "Docker VM memory ${MEMGB} GB (want 8 GB)" "Docker Desktop > Settings > Resources > Memory"
  else
    ok "docker $(docker info --format '{{.ServerVersion}}' 2>/dev/null), compose $COMPOSE, VM memory ${MEMGB} GB"; DOCKER_OK=1
  fi
fi

echo "Native path (JDK 21, sbt; stack/toolchain.sh)"
JVM_OK=0
JAVA=$(java -version 2>&1 | grep -oE 'version "[0-9]+' | grep -oE '[0-9]+' || true)
if [ "${JAVA:-0}" -eq 21 ] 2>/dev/null; then ok "JDK $JAVA ($(command -v java))"; JVM_OK=1
else optional "JDK 21 (found: ${JAVA:-none})" "brew install openjdk@21 (macOS 14+) or the Temurin binary under ~/.dpi-toolchain (docs/macos-13.md)"; fi
if command -v sbt >/dev/null; then ok "sbt ($(command -v sbt))"
else optional "sbt" "brew install sbt, or the sbt zip under ~/.dpi-toolchain (docs/macos-13.md)"; JVM_OK=0; fi

echo "The checks (either path)"
NODE=$(node --version 2>/dev/null | tr -d v)
if [ "${NODE%%.*}" = "22" ]; then ok "node $NODE"
else missing "Node 22 (found: ${NODE:-none})" "nvm install 22 (stack/toolchain.sh selects it); .nvmrc says 22"; fi
PY=$(python3 --version 2>/dev/null | vernum)
if [ -n "$PY" ] && atleast "$PY" 3.9; then
  if python3 -c 'import yaml' 2>/dev/null; then ok "python3 $PY with PyYAML"
  else missing "PyYAML for python3 $PY" "python3 -m pip install pyyaml  (scripts/merge-virginia-es.py reads YAML)"; fi
else missing "python3 3.9 or newer (found: ${PY:-none})" "brew install python3"; fi
if command -v xmllint >/dev/null; then ok "xmllint ($(xmllint --version 2>&1 | head -1))"
else missing "xmllint" "apt install libxml2-utils (macOS ships it)"; fi
if command -v git >/dev/null; then ok "git $(git --version | vernum)"; else missing "git" "xcode-select --install"; fi
if command -v gh >/dev/null; then ok "gh $(gh --version | vernum)"; else optional "gh" "brew install gh (only for the GitHub API; curl is the fallback)"; fi

echo "Machine"
AVAIL_KB=$(df -k . | awk 'NR==2 {print $4}')
if [ "$AVAIL_KB" -ge $((10 * 1024 * 1024)) ]; then ok "free disk $(( AVAIL_KB / 1048576 )) GB"
else missing "free disk $(( AVAIL_KB / 1048576 )) GB (want 10 GB for the first build)" "docker builder prune -af; docker image prune -f; never docker volume prune"; fi
for P in 3008 3009 3011; do
  if command -v lsof >/dev/null && lsof -nP -iTCP:$P -sTCP:LISTEN >/dev/null 2>&1; then
    warn "port $P is in use ($(lsof -nP -iTCP:$P -sTCP:LISTEN | awk 'NR==2 {print $1}')): fine if that is the site; else stop it before make up / make dev"
  else ok "port $P free"; fi
done
# An empty taxpert/packages/ui/src/dist (a stray from an older build) makes the port's copy-shared-ui nest the
# bundle at vendor/taxpert/dist/dist, and every page then 404s on taxpert.js: no workspace bar, no Scenario menu.
if [ -d taxpert/packages/ui/src/dist ]; then
  missing "taxpert/packages/ui/src/dist exists (the bundle will vendor one folder too deep)" "rmdir taxpert/packages/ui/src/dist, then make -C virginia/direct-file copy-shared-ui"
else ok "no stray taxpert/packages/ui/src/dist"; fi
if [ -f stack/browser-tools/node_modules/.installed ] || ls "$HOME/.cache/ms-playwright" 2>/dev/null | grep -q chromium; then
  ok "Playwright Chromium (make cases / make a11y)"
else optional "Playwright Chromium" "make browser-tools (the pinned Playwright and axe-core, and its Chromium)"; fi

echo
if [ $DOCKER_OK -eq 0 ] && [ $JVM_OK -eq 0 ]; then
  echo "Neither way in is ready: install Docker Desktop (make up), or JDK 21 and sbt (make dev)."; FAIL=1
elif [ $DOCKER_OK -eq 1 ] && [ $JVM_OK -eq 1 ]; then echo "Both ways in are ready: make up (Docker) or make dev (native)."
elif [ $DOCKER_OK -eq 1 ]; then echo "Ready for the Docker path: make up."
else echo "Ready for the native path: make dev (it bootstraps itself the first time)."; fi
exit $FAIL
