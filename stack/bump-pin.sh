#!/usr/bin/env bash
# `make bump-pin`: move one of the five IRS subtree pins (IRS_PINS.md) to a newer upstream commit.
#
#   stack/bump-pin.sh <repo> <sha40>            dry run: fetch the commit and print the drift report
#   stack/bump-pin.sh <repo> <sha40> --apply    git subtree pull --squash, then update IRS_PINS.md
#
# <repo> is the upstream name (form-builder-examples, fact-graph, form-builder, taxpert, direct-file);
# the folder and the current pin are read from the table in IRS_PINS.md.
#
# The drift report is the part that matters for Virginia: the IRS-owned files the Virginia commits
# also touched (derived from git, not a list kept by hand: every file changed by a commit after the
# subtree's squash, or changed in the working tree, that already existed at the pin) and what moved
# in them upstream between the old pin and the new. Those are where `git subtree pull` will conflict
# and where handoff/verify.sh will fail until the patches are rebased.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$PWD
export GIT_TERMINAL_PROMPT=0
die() { echo "bump-pin: $*" >&2; exit 1; }

REPO=${1:-}; NEW=${2:-}; APPLY=0
[ "${3:-}" = "--apply" ] && APPLY=1
[ -n "$REPO" ] && [ -n "$NEW" ] || die "usage: $0 <repo> <sha40> [--apply]"
echo "$NEW" | grep -qE '^[0-9a-f]{40}$' || die "'$NEW' is not a 40-character commit hash (git subtree needs all 40)"

# The row in IRS_PINS.md: | `folder/` | IRS-Public/repo | pin | date | role |
ROW=$(awk -F'|' -v r="IRS-Public/$REPO" '{c=$3; gsub(/^ +| +$/,"",c)} c == r' IRS_PINS.md)
[ -n "$ROW" ] || die "no row for IRS-Public/$REPO in IRS_PINS.md"
FOLDER=$(echo "$ROW" | awk -F'|' '{print $2}' | tr -d ' `/')
OLD=$(echo "$ROW" | awk -F'|' '{gsub(/ /,"",$4); print $4}')
echo "$OLD" | grep -qE '^[0-9a-f]{7,40}$' || die "could not read the pin for $FOLDER/ from IRS_PINS.md (got '$OLD')"
URL=https://github.com/IRS-Public/$REPO.git
case "$NEW" in "$OLD"*) die "$NEW is the current pin";; esac

# The archive (direct-file/) is fetched, not vendored (stack/fetch-archive.sh): nothing of ours is in
# it, so moving its pin is this table row and a fresh fetch.
if ! git ls-files --error-unmatch "$FOLDER" >/dev/null 2>&1; then
  echo "$FOLDER/ is not vendored; the pin is the row in IRS_PINS.md, and make fetch-archive fetches it."
  if [ $APPLY -eq 0 ]; then echo "Dry run. To do it: $0 $REPO $NEW --apply"; exit 0; fi
  TMP=$(mktemp -d "${TMPDIR:-/tmp}/bump-pin.XXXXXX"); trap 'rm -rf "$TMP"' EXIT
  git -C "$TMP" init -q
  git -C "$TMP" fetch -q --depth 1 "$URL" "$NEW" || die "GitHub would not serve $NEW from $URL"
  DATE=$(git -C "$TMP" log -1 --format=%cs FETCH_HEAD)
  python3 - "$FOLDER" "$REPO" "$OLD" "${NEW:0:12}" "$DATE" <<'PY'
import re, sys
folder, repo, old, new, date = sys.argv[1:]
p = "IRS_PINS.md"; s = open(p).read()
pat = re.compile(r"(\| `%s/` \| IRS-Public/%s \| )%s \| [0-9-]+ \|" % (re.escape(folder), re.escape(repo), old))
s, n = pat.subn(r"\g<1>%s | %s |" % (new, date), s)
assert n == 1, "IRS_PINS.md row not rewritten"
open(p, "w").write(s)
PY
  echo "==> IRS_PINS.md: $FOLDER/ now ${NEW:0:12} ($DATE). Next: git commit IRS_PINS.md; rm -rf $FOLDER && make fetch-archive"
  exit 0
fi

# The squash commit whose tree is the folder at the old pin (the newest one, if it was pulled before).
SQUASH=$(git log --format=%H --grep="^Squashed '$FOLDER/' content" | head -1)
[ -n "$SQUASH" ] || die "no squash commit for $FOLDER/: was it added with git subtree --squash?"

# IRS-owned files the Virginia work touches: changed since the squash (committed or not) AND present at the pin.
TOUCHED=$( { git log --format= --name-only "$SQUASH"..HEAD -- "$FOLDER"; git diff --name-only HEAD -- "$FOLDER"; } \
           | sed -n "s|^$FOLDER/||p" | sort -u | comm -12 - <(git ls-tree -r --name-only "$SQUASH" | sort) )

# Fetch the new commit into a scratch repository that can also see this one's objects, so the old
# tree ($SQUASH) and the new (FETCH_HEAD) can be diffed without touching this repository.
TMP=$(mktemp -d "${TMPDIR:-/tmp}/bump-pin.XXXXXX"); trap 'rm -rf "$TMP"' EXIT
git -C "$TMP" init -q
echo "$ROOT/.git/objects" > "$TMP/.git/objects/info/alternates"
echo "==> fetching IRS-Public/$REPO@${NEW:0:12}"
git -C "$TMP" fetch -q --depth 1 "$URL" "$NEW" || die "GitHub would not serve $NEW from $URL: no network, or not a commit on that repository"
DATE=$(git -C "$TMP" log -1 --format=%cs FETCH_HEAD)

echo
echo "Drift report: $FOLDER/  $OLD ($(echo "$ROW" | awk -F'|' '{gsub(/ /,"",$5); print $5}')) -> ${NEW:0:12} ($DATE)"
echo "  upstream overall: $(git -C "$TMP" diff --shortstat "$SQUASH" FETCH_HEAD | sed 's/^ *//')"
if [ -z "$TOUCHED" ]; then
  echo "  no IRS-owned file in $FOLDER/ carries a Virginia change, so nothing can conflict."
else
  echo "  IRS-owned files the Virginia work touches ($(echo "$TOUCHED" | wc -l | tr -d ' ')):"
  echo "$TOUCHED" | sed 's/^/    /'
  echo "  of those, changed upstream between the two pins:"
  # shellcheck disable=SC2086
  STAT=$(git -C "$TMP" diff --stat "$SQUASH" FETCH_HEAD -- $TOUCHED)
  [ -n "$STAT" ] && echo "$STAT" | sed 's/^/    /' || echo "    none: the pull should merge cleanly"
fi
echo

if [ $APPLY -eq 0 ]; then
  echo "Dry run. To do it: $0 $REPO $NEW --apply"
  exit 0
fi

git diff --quiet HEAD -- IRS_PINS.md "$FOLDER" || die "uncommitted changes under $FOLDER/ or in IRS_PINS.md: commit or stash first"
echo "==> git subtree pull --prefix=$FOLDER $URL $NEW --squash"
git subtree pull --prefix="$FOLDER" "$URL" "$NEW" --squash -m "Pull IRS-Public/$REPO at ${NEW:0:12} ($DATE)" \
  || die "the subtree pull did not merge cleanly: resolve the conflicts above, then git commit and update IRS_PINS.md by hand"
python3 - "$FOLDER" "$REPO" "$OLD" "${NEW:0:12}" "$DATE" <<'EOF'
import re, sys
folder, repo, old, new, date = sys.argv[1:]
p = "IRS_PINS.md"; s = open(p).read()
pat = re.compile(r"(\| `%s/` \| IRS-Public/%s \| )%s \| [0-9-]+ \|" % (re.escape(folder), re.escape(repo), old))
s, n = pat.subn(r"\g<1>%s | %s |" % (new, date), s)
assert n == 1, "IRS_PINS.md row not rewritten"
open(p, "w").write(s)
EOF
echo "==> IRS_PINS.md: $FOLDER/ now ${NEW:0:12} ($DATE); the subtree merge is committed, this edit is not."
echo "    next: git commit IRS_PINS.md; make bootstrap && make test && make check; make handoff-verify"
