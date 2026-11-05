# ADR-004: The Virginia site beside the IRS trees, not inside them

Licence: the Virginia additions are CC0 1.0, public domain, like the IRS code they sit on (the repository's `LICENSE`).

- Created: 2026-11-05
- Published: 2026-11-05
- Status: accepted (class project, Digital Public Infrastructure, Georgetown; not an IRS or Virginia Tax decision)
- Amends: [ADR-003](003-the-layout-for-growth.md), whose decisions stand; this record moves the folder they describe

## Primary author(s)

Graham Chickering, with Claude (Anthropic) as the engineering assistant.

## Problem statement

Until this record the Virginia site was the IRS's own `direct-file` application edited in place:
`form-builder-examples/direct-file/`, inside the vendored copy of IRS-Public/form-builder-examples,
with the Virginia work as ordinary commits on top of the pinned tree and a patch series as the
handoff. That made one folder two things at once: the IRS's reference application as pinned, and
the Virginia prototype. A reader could not tell which lines were the IRS's without a diff, a state
team taking the handoff did not start from the tree a fresh clone of the IRS repository gives them,
and `make bump-pin` had to carry a drift report for the IRS files the Virginia commits touched.

## Decision

1. **The four vendored IRS repositories are byte for byte the commits in `IRS_PINS.md`.** Nothing in
   `form-builder-examples/`, `fact-graph/`, `form-builder/` or `taxpert/` is edited, pruned or
   added to, including the sibling example applications nobody here runs. A clone of this
   repository holds exactly what a clone of each IRS repository at its pin holds.

2. **The Virginia site is `virginia/direct-file/`:** the IRS's `direct-file` application copied out
   of `form-builder-examples/` and changed there. It sits two levels below the root on purpose, so
   that every relative path the IRS wrote into it (`../../fact-graph`, `../../form-builder`,
   `../../taxpert/packages/ui` in the Makefile, `package.json`, the Dockerfile and the compose
   files; `../../direct-file` for the archive) resolves to the same sibling it always did, with no
   edit to the IRS's build files beyond the ones ADR-002 already lists.

3. **The handoff is one patch and the log that built it.** `handoff/export.sh` diffs the IRS
   application at the pin against `virginia/direct-file/` and writes `virginia.patch`, relative to
   the application folder, with `CHANGELOG.md`, the Virginia commits oldest first, beside it. A
   state team clones the IRS repository at the pin and runs `git apply --directory=direct-file`.
   `handoff/verify.sh` does exactly that against a fresh clone and runs the no-JVM checks inside it.
   The commit-by-commit patch series of ADR-001 to ADR-003 is retired: the move changes every path,
   and a series that had to be read across the move would mislead more than it explained.

## Consequences

- `make bump-pin`'s drift report, the IRS files the Virginia work touches, is empty by
  construction; anything it lists is a stray edit to an IRS tree and a reason to stop.
- `virginia` at the root is a folder, not a link; `cd virginia/direct-file` is the Virginia site.
- Every guide, check and script that named `form-builder-examples/direct-file` names
  `virginia/direct-file`. The scripts find the repository root from their own location
  (`scripts/lib/vafacts.py`), so none needed a change beyond the one literal in the stats check.
- The history before this record has the Virginia commits under the old path. `git log --follow`
  and `handoff/export.sh`'s changelog read across the move; `git blame` on a Virginia file does too.
- ADR-002's list of the IRS files the change set touches still holds, read as "the files in
  `virginia/direct-file/` that differ from the IRS application at the pin".
