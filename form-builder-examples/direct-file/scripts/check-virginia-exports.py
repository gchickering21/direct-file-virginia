#!/usr/bin/env python3
"""The integration rule from docs/adr/001-virginia-state-return.md, enforced.

Every federal fact the Virginia module reads must be one the federal return already
exports to a state: flagged stateSystems="true" (the state API's enriched JSON) or
mef="true" (the Form 1040 XML), both of which the state API delivered to a state's
software. The one exception is the residency answer, which gates the Virginia screens and
computes nothing. Exit 1 and name the offenders otherwise.
"""
import pathlib, re, sys

FACTS = pathlib.Path(__file__).resolve().parents[1] / "src/main/resources/direct-file/facts"
ALLOWED_GATES = {"/filerResidenceAndIncomeState"}

def exports():
    flags = {}
    for f in FACTS.glob("*.xml"):
        if f.name.startswith("virginia"):
            continue  # our own modules are not federal facts
        for m in re.finditer(r'<Fact path="([^"]+)"(.*?)</Fact>', f.read_text(), re.S):
            ex = re.search(r"<Export([^/]*)/>", m.group(2))
            flags[(f.stem, m.group(1))] = ex.group(1) if ex else ""
    return flags

def main():
    flags = exports()
    va = (FACTS / "virginia.xml").read_text()
    bad, seen = [], set()
    for m in re.finditer(r'<Dependency module="([^"]+)" path="([^"]+)"', va):
        module, path = m.group(1), m.group(2)
        if (module, path) in seen:
            continue
        seen.add((module, path))
        if path in ALLOWED_GATES or module.startswith("virginia"):
            continue
        # /primaryFiler/x is the primary filer's /filers/*/x
        lookup = path.replace("/primaryFiler/", "/filers/*/") if path.startswith("/primaryFiler/") else path
        attrs = flags.get((module, lookup))
        if attrs is None:
            bad.append(f"{module}:{path}  (not found in the federal dictionary)")
        elif 'stateSystems="true"' not in attrs and 'mef="true"' not in attrs:
            bad.append(f"{module}:{path}  (exported: {attrs.strip() or 'nothing'})")
    print(f"{len(seen)} federal facts read by facts/virginia.xml")
    for s in sorted(seen):
        print(f"  {s[0]}:{s[1]}")
    if bad:
        print("\nNOT exported to states or MeF:")
        for b in bad:
            print("  " + b)
        return 1
    print("\nevery one is exported to state systems or to MeF (or is the residency gate)")
    return 0

if __name__ == "__main__":
    sys.exit(main())
