#!/usr/bin/env bash
# The vendored Fact Graph engine bundle is committed, and `make copy-fg` rewrites it from a fresh
# Scala.js build whose output orders the same definitions differently: a four-megabyte diff with no
# change of meaning, which then rides along in every commit that touched the port. This tells the
# two apart by comparing the sorted lines of HEAD's copy with the working tree's.
#
#   stack/check-vendor-drift.sh          report: exit 0 when unchanged or a real change, 1 when reorder-only
#   stack/check-vendor-drift.sh --fix    and restore HEAD's copy when it is reorder-only
set -euo pipefail
cd "$(dirname "$0")/.."
FILE=form-builder-examples/direct-file/src/main/resources/direct-file/website-static/vendor/fact-graph/factgraph-3.1.0.js

if git diff --quiet HEAD -- "$FILE"; then
  echo "vendored engine: unchanged ($FILE)"
  exit 0
fi
if cmp -s <(git show "HEAD:$FILE" | sort) <(sort "$FILE"); then
  if [ "${1:-}" = "--fix" ]; then
    git checkout -- "$FILE"
    echo "vendored engine: reorder only; restored HEAD's copy of $FILE"
    exit 0
  fi
  echo "vendored engine: reorder only: run git checkout -- $FILE  (or: $0 --fix)"
  exit 1
fi
echo "vendored engine: content differs from HEAD (a real rebuild, not a reorder): $FILE"
exit 0
