#!/usr/bin/env bash
# `make handoff-verify`: prove that the Virginia change set still lands on the IRS's repository.
#
# Clones IRS-Public/form-builder-examples at the commit IRS_PINS.md pins (a shallow fetch of that
# one commit, into a temporary directory), refreshes handoff/patches/ with export.sh, applies
# virginia.patch to the clone's direct-file application, and then runs the checks that need no JVM
# inside it: the Virginia XML modules against the IRS schemas, the export rule, and the Spanish keys.
# One line of verdict at the end; exit 1 on any failure.
#
#   handoff/verify.sh                  # needs network (GitHub), git, xmllint, python3 with PyYAML
#   KEEP=1 handoff/verify.sh           # leave the clone behind, and say where
#   PIN_SHA=<40 chars> handoff/verify.sh   # skip the lookup of the full commit hash
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$PWD
REPO=form-builder-examples
URL=https://github.com/IRS-Public/$REPO.git
APP=direct-file
export GIT_TERMINAL_PROMPT=0

die() { echo "handoff-verify: FAIL: $*" >&2; exit 1; }

for t in git xmllint python3 curl; do command -v $t >/dev/null || die "$t is not installed"; done
python3 -c 'import yaml' 2>/dev/null || die "python3 has no PyYAML (python3 -m pip install pyyaml)"

# The pin: the 12-character hash in IRS_PINS.md. Fetching one commit by hash needs all 40, so look
# for a full hash with that prefix in IRS_PINS.md or handoff/README.md, and failing that ask GitHub.
PIN=$(awk -F'|' -v f="\`$REPO/\`" '$2 ~ f {gsub(/ /,"",$4); print $4}' IRS_PINS.md)
[ -n "$PIN" ] || die "no row for $REPO in IRS_PINS.md"
SHA=${PIN_SHA:-$(grep -ohE "\b$PIN[0-9a-f]*\b" IRS_PINS.md handoff/README.md | awk 'length == 40' | head -1)}
if [ -z "$SHA" ]; then
  SHA=$(curl -fsS --max-time 20 -H 'Accept: application/vnd.github.sha' \
        "https://api.github.com/repos/IRS-Public/$REPO/commits/$PIN" 2>/dev/null || true)
  [ -n "$SHA" ] || die "could not resolve $PIN to a full commit hash: no network, or GitHub unreachable (set PIN_SHA=<40 chars>)"
fi
echo "$SHA" | grep -qE '^[0-9a-f]{40}$' || die "'$SHA' is not a 40-character commit hash"
case "$SHA" in "$PIN"*) ;; *) die "PIN_SHA $SHA does not start with the pin $PIN";; esac

# Network, checked once with a clear message rather than a git stack trace later.
git ls-remote --exit-code -h "$URL" >/dev/null 2>&1 || die "cannot reach $URL: no network, or GitHub is down"

# 1. The patch, refreshed from the commits (export.sh is commit-based, so uncommitted edits are not in
#    it; commit first if that is what you mean to verify).
PATCHES=$ROOT/handoff/patches
handoff/export.sh "$PATCHES"
[ -s "$PATCHES/virginia.patch" ] || die "export.sh wrote no patch"

# 2. A fresh clone of the IRS repository at the pin: one commit, no history.
TMP=$(mktemp -d "${TMPDIR:-/tmp}/handoff-verify.XXXXXX")
[ "${KEEP:-}" = 1 ] || trap 'rm -rf "$TMP"' EXIT
echo "==> fetching IRS-Public/$REPO at ${SHA:0:12} into $TMP"
git -C "$TMP" init -q
git -C "$TMP" remote add origin "$URL"
git -C "$TMP" fetch -q --depth 1 origin "$SHA" || die "GitHub would not serve commit $SHA (is the pin on a branch upstream still has?)"
git -C "$TMP" checkout -q FETCH_HEAD

# 3. Apply. The patch is relative to the application folder, so --directory puts it there. A failure
#    is a real difference between the pin and the tree the patch was made from.
echo "==> git apply --directory=$APP virginia.patch"
git -C "$TMP" apply --directory="$APP" --index "$PATCHES/virginia.patch" \
  || die "virginia.patch does not apply cleanly at ${SHA:0:12} (see $TMP, rerun with KEEP=1)"

# 4. The checks, as the application's own Makefile runs them. validate-xml is xmllint over the two
#    directories and nothing else; it is run through make when make is here so an upstream change
#    to the target is honoured, and spelled out otherwise.
cd "$TMP/$APP"
R=src/main/resources/direct-file
echo "==> validate-xml"
if command -v make >/dev/null; then
  make -s validate-xml >/dev/null || die "validate-xml failed in the clone"
else
  find $R/facts -name '*.xml' | xargs xmllint --quiet --relaxng $R/facts/FactDictionaryModule.rng >/dev/null || die "facts fail the schema"
  find $R/flow -name '*.xml' | xargs xmllint --quiet --relaxng $R/flow/FlowConfig.rng >/dev/null || die "flow fails the schema"
fi
echo "==> check-virginia-exports.py"
python3 scripts/check-virginia-exports.py || die "the export rule fails in the clone"
echo "==> merge-virginia-es.py --check"
python3 scripts/merge-virginia-es.py --check || die "the Spanish keys fail in the clone"

[ "${KEEP:-}" = 1 ] && echo "==> clone kept at $TMP"
echo "handoff-verify: OK: virginia.patch applies to IRS-Public/$REPO@${SHA:0:12}; the schemas, the export rule and the Spanish keys pass there"
