#!/usr/bin/env python3
"""The Virginia docs name only facts that exist. Exit 1 and list the offenders otherwise.

    python3 scripts/check-virginia-docs.py                    # check every doc below
    python3 scripts/check-virginia-docs.py --ignore <file>    # print that file's misses, do not fail on them
                                                              # (repeatable; a path relative to the repository root)

Scans the documents that cite fact paths (the policy map, the field map, the ADRs, the Virginia
README, the handoff README and brief) for every `/va…` path: `/vaX`, `/formW2s/*/vaX`,
`/filers/*/vaX` (a capital after `va`). Each must be the path of a <Fact> in one of the Virginia modules,
facts/virginia*.xml. A path written as a prefix, `/vaWithCredit…` (or `/vaWithCredit...`),
passes when some fact path starts with it: that is how the docs name a family of facts.

Then, as a warning only: every Form 760 line a fact's <Name> claims ("Form 760 Line 19a", "Lines
20 to 22", "Line 8 if the return …") must have a row in handoff/POLICY_MAP.md whose first cell
names that line. Schedule ADJ lines are the schedule's own numbering and are not checked.
"""
import argparse, glob, pathlib, re, sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent / "lib"))
from vafacts import PORT, ROOT, all_facts  # noqa: E402

POLICY_MAP = ROOT / "handoff/POLICY_MAP.md"
DOCS = [
    ROOT / "handoff/POLICY_MAP.md",
    ROOT / "handoff/FORM_760_FIELD_MAP.md",
    ROOT / "handoff/README.md",
    ROOT / "handoff/BRIEF.md",
    PORT / "docs/virginia/README.md",
    ROOT / "GETTING_STARTED.md",
    ROOT / "CONTRIBUTING.md",
] + [pathlib.Path(p) for p in sorted(glob.glob(str(PORT / "docs/adr/*.md")))] \
  + [pathlib.Path(p) for p in sorted(glob.glob(str(ROOT / "docs/*.md")))]
DOCS = [d for d in DOCS if d.exists()]  # the root guides are not in a clone of the IRS repository

# A Virginia fact path is /va followed by a capital (so `scripts/lib/vafacts.py` is not one).
CITED = re.compile(r"(/(?:formW2s/\*/|filers/\*/)?va[A-Z][A-Za-z0-9]*)(…|\.\.\.)?")
LINE_WORD = re.compile(r"\bLines?\s+(\d+[ab]?(?:\s*(?:to|,|and)\s*\d+[ab]?)*)")
NUM = re.compile(r"\d+[ab]?")


def fact_paths():
    paths, names = set(), {}
    for f in all_facts():
        paths.add(f.path)
        names[f.path] = f.name
    return paths, names


def expand(spec):
    """'19a to 22' -> {19a, 20, 21, 22}; '26, 27 and 28' -> {26, 27, 28}; '4' -> {4}."""
    out = set()
    for part in re.split(r"\s*,\s*|\s+and\s+", spec):
        rng = re.fullmatch(r"(\d+)([ab]?)\s+to\s+(\d+)([ab]?)", part.strip())
        if rng:
            lo, hi = int(rng.group(1)), int(rng.group(3))
            out.add(rng.group(1) + rng.group(2))
            out.update(str(n) for n in range(lo + 1, hi))
            out.add(rng.group(3) + rng.group(4))
        else:
            out.update(NUM.findall(part))
    return out


def lines_claimed(names):
    """Form 760 line -> the fact paths whose <Name> claims it."""
    claimed = {}
    for path, name in names.items():
        if "Schedule ADJ" in name or "worksheet" in name.lower():
            continue
        for m in LINE_WORD.finditer(name):
            for line in expand(m.group(1)):
                # a lettered line that is not 19a/19b is Schedule ADJ's (16a, 16b), whatever the name says
                if line[-1] in "ab" and line not in ("19a", "19b"):
                    continue
                claimed.setdefault(line, []).append(path)
    return claimed


def lines_in_policy_map():
    rows = set()
    for text in POLICY_MAP.read_text().splitlines():
        if not text.startswith("|"):
            continue
        first = text.split("|")[1].strip()
        if first and first[0].isdigit():
            rows.update(expand(first.replace("**", "")))
    return rows


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--ignore", action="append", default=[], metavar="FILE",
                    help="report this file's missing paths without failing on them (relative to the repository root)")
    args = ap.parse_args()
    ignored = {(ROOT / f).resolve() for f in args.ignore}

    paths, names = fact_paths()
    failed = False
    for doc in DOCS:
        text = doc.read_text()
        cited, missing = set(), []
        for m in CITED.finditer(text):
            path, prefix = m.group(1), m.group(2)
            cited.add(path)
            ok = any(p.startswith(path) for p in paths) if prefix else path in paths
            if not ok:
                missing.append(path + (prefix or ""))
        missing = sorted(set(missing))
        rel = doc.relative_to(ROOT)
        if missing:
            tag = "ignored" if doc.resolve() in ignored else "FAIL"
            print(f"{rel}: {len(cited)} fact paths cited, {len(missing)} not in the XML ({tag}):")
            for p in missing:
                print(f"  {p}")
            if doc.resolve() not in ignored:
                failed = True
        else:
            print(f"{rel}: {len(cited)} fact paths cited, all exist")

    claimed = lines_claimed(names)
    rows = lines_in_policy_map()
    unmapped = sorted((l for l in claimed if l not in rows), key=lambda s: (int(NUM.match(s).group().rstrip("ab")), s))
    if unmapped:
        print(f"\nwarning: {len(unmapped)} Form 760 line(s) named by a fact have no row in handoff/POLICY_MAP.md:")
        for line in unmapped:
            print(f"  Line {line}: " + ", ".join(sorted(claimed[line])))
    else:
        print(f"\nevery Form 760 line a fact names ({len(claimed)}) has a row in handoff/POLICY_MAP.md")

    if failed:
        print("\nFAIL: the docs cite fact paths the XML does not have")
        return 1
    print("the docs cite only facts that exist")
    return 0


if __name__ == "__main__":
    sys.exit(main())
