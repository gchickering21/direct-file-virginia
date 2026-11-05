#!/usr/bin/env bash
# `make fetch-archive`: put IRS-Public/direct-file, the real 2025 federal application, at direct-file/
# at the commit IRS_PINS.md pins. It is 570 MB that nothing in the Virginia work needs, so it is
# fetched when wanted rather than vendored: to run the "before" (docs/archive-2025.md), or to run the
# port's `make transpile`, whose codemod reads ../../direct-file/direct-file/df-client.
#
# A shallow fetch of the one commit, into direct-file/, which .gitignore ignores. Re-running on an
# existing checkout at the pin does nothing; at another commit it refuses rather than overwrite.
set -euo pipefail
cd "$(dirname "$0")/.."
REPO=direct-file
URL=https://github.com/IRS-Public/$REPO.git
export GIT_TERMINAL_PROMPT=0
die() { echo "fetch-archive: $*" >&2; exit 1; }

PIN=$(awk -F'|' -v f="\`$REPO/\`" '$2 ~ f {gsub(/ /,"",$4); print $4}' IRS_PINS.md)
[ -n "$PIN" ] || die "no row for $REPO in IRS_PINS.md"
if [ -d "$REPO/.git" ]; then
  HAVE=$(git -C "$REPO" rev-parse HEAD)
  case "$HAVE" in "$PIN"*) echo "fetch-archive: $REPO/ is already at the pin ${PIN}"; exit 0;; esac
  die "$REPO/ is at ${HAVE:0:12}, not the pin $PIN: move or remove it first"
fi
[ ! -e "$REPO" ] || die "$REPO/ exists and is not a git checkout: move or remove it first"

# Fetching one commit by hash needs all 40 characters; IRS_PINS.md keeps 12, so ask GitHub.
SHA=${PIN_SHA:-$(curl -fsS --max-time 20 -H 'Accept: application/vnd.github.sha' "https://api.github.com/repos/IRS-Public/$REPO/commits/$PIN" 2>/dev/null || true)}
echo "$SHA" | grep -qE '^[0-9a-f]{40}$' || die "could not resolve $PIN to a full commit hash (no network?); set PIN_SHA=<40 chars>"
case "$SHA" in "$PIN"*) ;; *) die "PIN_SHA $SHA does not start with the pin $PIN";; esac
echo "==> fetching IRS-Public/$REPO at ${SHA:0:12} into $REPO/ (about 570 MB)"
git init -q "$REPO"
git -C "$REPO" remote add origin "$URL"
git -C "$REPO" fetch -q --depth 1 origin "$SHA"
git -C "$REPO" checkout -q FETCH_HEAD
echo "fetch-archive: $REPO/ at ${SHA:0:12}; docs/archive-2025.md says how to run it"
